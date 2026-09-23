# Administrative Profile & Personal Preferences Center (Phase 7, Prompt 17)

Replaces Prompt 0.2's `SettingsPage` placeholder with a real, secure personal
workspace for the currently-authenticated administrator. This is the first
Reception Dashboard module whose entire purpose is self-scoped: every
capability it exposes reads or writes exactly one row — the caller's own.

## 1. Architecture summary

```
Authenticated staff session
        |
GET/PATCH /api/v1/profile  (self-scoped only — staff id from request.auth, never the client)
        |
   +----+----+
   |         |
staff.full_name   staff_preferences (new table, 1:1 with staff)
(existing self-update RLS)   (new: notifications/dashboard/theme/accessibility/shortcuts)
```

- **Identity fields** (role, hostel assignment, account status) remain owned
  entirely by Identity & Access Administration (Prompt 13) — this page has
  no control that can touch any of them, and the backend's own
  `ProfileUpdateBody` schema does not declare them at all (`.strict()`
  rejects an attempt to send one with `400`).
- **`fullName`** writes to `staff.full_name`, reusing the pre-existing
  `staff_update_own_limited` RLS policy (QG-01) — not a new capability.
- Everything else (contact fields, notification/dashboard/theme/
  accessibility preferences, shortcuts) lives in one new table,
  `staff_preferences` — a single row per staff member, always loaded and
  saved as one coherent unit, matching Configuration Center's own
  "one generic table, not several fragmented ones" precedent.

## 2. Personal preference storage & ownership

`staff_preferences` (migration `0025_prompt17_admin_profile_preferences.sql`):
named, CHECK-constrained `text` columns for small closed-set settings
(`theme`, `density`, `font_scale`, `date_format`,
`preferred_contact_method`), `jsonb` only for the three genuinely
open-ended shapes (`notification_preferences`, `dashboard_preferences`,
`shortcuts`) — fully validated server-side on every write
(`apps/api/src/domain/profile/types.ts`), never a generic key-value bag.

Ownership: `staff_id` (unique, `ON DELETE CASCADE` from `staff`). RLS grants
exactly three self-only policies (SELECT/INSERT/UPDATE), each requiring
`staff_id = public.current_staff_id()`. **Deliberately no super_admin
bypass policy** — unlike `staff` itself (an identity record super_admin
legitimately administers), this table holds only personal workspace
preferences with no administrative meaning to anyone but their owner. No
role in this application has a legitimate reason to read or write another
staff member's personal preferences, so none was granted — see
`supabase/tests/database/29_prompt17_staff_preferences_rls.sql` for the
12-assertion adversarial proof (self access, cross-staff denial for every
role including super_admin, ownership-tampering denial, anon denial).

A missing preferences row is transparently created with safe defaults on
first access (`ProfileRepository.getOrCreate`) — never an error.

## 3. Notification preference model

Eight categories (`apps/api/src/domain/profile/types.ts`'s
`NOTIFICATION_CATEGORIES`, mirrored in the frontend's
`lib/profile/notificationCategories.ts`): `emergency_alert`, `health_alert`,
`parent_approval`, `leave_authorization`, `student_movement`,
`administrative`, `audit`, `system_maintenance`.

`emergency_alert`/`health_alert` are **mandatory** — `ProfileService.update()`
rejects any attempt to set either to `false` with
`400 profile_mandatory_notification`, enforced server-side regardless of
what the client sends (the frontend also disables their toggle, but the
enforcement is the backend's, not the UI's).

**Honesty boundary**: no staff-facing notification delivery mechanism
exists anywhere in this repository (`docs/current-state.md`'s long-standing
finding, re-confirmed during this task's own reconnaissance — `notifications`'
`recipientType` enum has no `staff` value). These preferences are genuinely
stored, validated, and audited, but **STORED — RUNTIME CONSUMPTION
DEFERRED**, matching Enterprise Configuration Center's identical honesty
convention. The UI says so explicitly.

## 4. Dashboard preference design

`defaultLandingPage` (own column, small curated allow-list of real routes)
plus `dashboardPreferences` (jsonb: `compactMode`, `widgetVisibility`,
`savedFilters`). Personalization only — hiding a widget is a preference;
RequireRole/RequirePermission still gate every actual route regardless of
what a caller stores here, so a stale/forged value can never grant
unauthorized access, only a cosmetically wrong default.

## 5. Session management

- **Current session sign-out**: reuses `AuthContext.signOut()` unchanged.
- **Sign out other sessions**: `authService.signOutOtherSessions()` calls
  Supabase Auth's own native `client.auth.signOut({ scope: "others" })`.
  There is no user/session identifier parameter anywhere in this call or in
  GoTrue's own API for it — "which sessions" is derived entirely
  server-side from the caller's own presented access token, so this cannot
  be used to target another user's session by construction, not by an
  application-level check. Reported to the existing staff-auth audit trail
  as a new event, `sessions_signed_out_others` (extends
  `apps/api/src/domain/auth/staffAuthAudit.ts`'s existing enum — same
  route, `POST /auth/staff/audit-events`, no new endpoint).
- **Not available**: a recent-sessions/device list. No such data source
  exists — no `sessions` table, and QG-04 already established the Admin API
  has no session-listing capability (`sessions_invalidated_before` is a
  one-way invalidation watermark, not a session-listing system). The UI
  states this plainly rather than fabricating a list.

## 6. Audit integration

Every `PATCH /profile` that changes at least one field writes exactly one
`audit_logs` row (`action: "profile.updated"`, `entityType: "staff"`,
reusing the existing `staff` entity type every other staff-identity audit
event already uses — no new entity type), inside the same transaction as
the underlying writes, with `before`/`after` metadata (no secret/token
value is ever placed in it). `sessions_signed_out_others` is audited via the
existing staff-auth-event mechanism. No second audit table or mechanism was
introduced.

## 7. Security summary

- **Authentication**: `app.authenticate` (unchanged).
- **Authorization**: any staff role (`reception_warden`/`hostel_admin`/
  `library_incharge`/`super_admin`) — no AAL2 requirement, a deliberate
  decision: personal, non-privileged preference changes carry no
  privilege-escalation risk regardless of assurance level, unlike
  `configurationRoutes`/`staffRoutes`, which do require it.
- **Self-only ownership**: the acting staff id is read exclusively from
  `request.auth.profile.id` (server-resolved from the verified JWT + a live
  `staff` row lookup) — never from `req.body`. `ProfileUpdateBody`'s
  `.strict()` schema does not declare `staffId`/`authUserId`/`role`/
  `hostelId`/`status`/`id` at all, so sending any of them is rejected `400`.
- **RLS**: independently enforces the same self-only invariant at the
  database layer (§2) — defense in depth, not the only line of defense.
- **Adversarial verification performed** (real, not merely asserted):
  - Real-Postgres integration tests
    (`apps/api/src/domain/profile/repository.integration.test.ts`) prove
    `update()` never writes another staff member's row.
  - Route-level tests (`apps/api/src/routes/profile.test.ts`) prove a
    forged `staffId` in the PATCH body is rejected (400), every
    identity/authorization field is rejected if present, and every staff
    role (including `library_incharge`, excluded from `/audit` and
    `/configuration`) can reach its own profile.
  - pgTAP (`supabase/tests/database/29_prompt17_staff_preferences_rls.sql`)
    proves cross-staff SELECT/UPDATE/INSERT denial independently of Fastify,
    for every role including super_admin, plus anon denial.
  - A genuine, previously-latent gap was found and fixed during this task's
    own adversarial verification (§8).

## 8. Cross-user state isolation (found and fixed this task)

Adversarial verification asked: "after User A signs out and User B signs
in on the same browser, does any of User A's state remain visible?" Direct
inspection found **no code anywhere in this app previously cleared
TanStack Query's cache on sign-out** — a real, previously-unaddressed gap,
not specific to this feature but exactly the kind this feature's own data
would have exposed first. Fixed in `AuthContext.tsx`'s `signOut()`:
`queryClient.clear()` runs immediately after `authService.signOut()`
succeeds. Every cached query is per-user server state, so clearing the
whole cache on every sign-out is correct for all of them, not only
`/profile`.

## 9. Loading & error strategy

`ContentLayout`'s existing `loading`/`error` props handle the page-level
states (unchanged infrastructure). Each section has its own `isSaving`
button state and a toast (success/failure) on save — never an optimistic
update for the save itself (the query cache is only updated from the
server's own returned response, `onSuccess: setQueryData`, matching this
codebase's "optimistic updates only where safe" discipline — a save is
cheap and fast enough not to need one).

## 10. Accessibility

- `Toggle` (new shared primitive, `components/ui/Toggle.tsx`) is a native
  `<input type="checkbox" role="switch">` with a real associated `<label>`
  — not a hand-rolled `<div role="switch">` — so keyboard operation (Space),
  screen-reader semantics, and focus visibility are all the platform's own,
  not reimplemented.
- Reduced motion / high contrast / font scale are **genuinely wired to the
  DOM**, not just stored state: `ThemeContext` applies `data-theme`,
  `data-reduced-motion`, `data-high-contrast`, `data-font-scale` attributes
  to `<html>`, and `tokens.css` gained real CSS rules that respond to each
  one (`[data-reduced-motion="true"] * { animation-duration: 0.001ms
  !important; ... }`, etc.) — verified by
  `apps/reception-dashboard/src/contexts/ThemeContext.test.tsx`, which
  asserts the actual DOM attributes change, not merely that React state
  updates.
- Additive only: no security warning, authorization state, or confirmation
  step is weakened by any accessibility preference.
- **What was NOT independently validated this task**: a manual screen-reader
  pass (NVDA/VoiceOver) and a keyboard-only walkthrough of the full page
  were not performed live (no such tooling available in this environment) —
  recorded honestly as not done, not claimed.

## 11. Testing summary

| Layer | File | Result |
|---|---|---|
| Backend route (unit, fakes) | `apps/api/src/routes/profile.test.ts` | 11/11 pass |
| Backend repository (real Postgres) | `apps/api/src/domain/profile/repository.integration.test.ts` | 5/5 pass |
| Database RLS (pgTAP) | `supabase/tests/database/29_prompt17_staff_preferences_rls.sql` | 12/12 pass |
| Frontend page | `apps/reception-dashboard/src/pages/SettingsPage.test.tsx` | 9/9 pass |
| Frontend primitive | `apps/reception-dashboard/src/components/ui/Toggle.test.tsx` | 3/3 pass |
| Frontend context | `apps/reception-dashboard/src/contexts/ThemeContext.test.tsx` | 3/3 pass |
| Regression (existing test genuinely broken by this feature, fixed) | `apps/reception-dashboard/src/layouts/DashboardLayout.test.tsx` | 3/3 pass (was 0/3 until `QueryClientProvider`/`ThemeProvider` wrapping was added — `ThemePreferenceSync`, now mounted in this layout, needs both) |
| Full workspace suite | `pnpm exec vitest run` | 223 files / 1,874 tests pass |
| Full pgTAP suite (fresh `supabase db reset`) | `supabase test db` | 390/390 pass |
| Typecheck / Lint / Format / Build | all workspace packages | clean |

No test was skipped and reported as passing; no live authenticated
browser E2E was performed this task (blocked by this development
environment's own `.env.local` read/write permission denial, an
environment constraint, not a code defect) — recorded as **UNVERIFIED**,
not fabricated.

## 12. Deferred / not implemented (honestly, not silently)

- Profile photo upload — no Supabase Storage infrastructure exists in this
  repository for it.
- Recent-sessions/device list, login history beyond the existing audit
  trail — no data source exists (§5).
- Saved dashboard layouts beyond the current preference fields.
- Localization/multi-language.
- A dedicated screen-reader/keyboard-only manual accessibility pass (§10).
- Live, authenticated browser E2E verification (§11) — blocked by this
  session's environment permissions, not attempted as a substitute with
  fabricated evidence.

## 13. Developer notes

- New backend domain: `apps/api/src/domain/profile/` (`types.ts`,
  `errors.ts`, `repository.ts`, `service.ts`, `__fixtures__/`), route
  `apps/api/src/routes/profile.ts`, plugin `apps/api/src/plugins/profile.ts`,
  rate-limit tier `profile` (`RATE_LIMIT_PROFILE`, 60/min — generous, since
  every staff role reads this on every page and it has no cross-user
  effect).
- OpenAPI-first: `packages/api-spec/openapi.yaml` gained `/profile` GET/PATCH
  and the `Profile`/`ProfilePreferences`/`ProfileUpdateBody`/
  `StaffIdentity`/`PersonalShortcut` schemas, plus an additive `actorId`
  filter on the existing `GET /audit` (Personal Activity, §6 of the route's
  own doc comment) and one new `StaffAuthEventBody` enum value
  (`sessions_signed_out_others`). Regenerated via
  `pnpm --filter @digihostel/api-spec run codegen`.
- Frontend: `services/profile/ProfileService.ts`,
  `features/profile/useProfile.ts` (TanStack Query, mirrors `useAuditLog`),
  `pages/SettingsPage.tsx` (real implementation replacing the placeholder),
  `components/profile/{PersonalActivityPanel,ThemePreferenceSync}.tsx`,
  `components/ui/Toggle.tsx` (new shared primitive),
  `lib/profile/notificationCategories.ts`.
