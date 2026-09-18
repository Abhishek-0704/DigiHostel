# Identity & Access Administration Center (Phase 5, Prompt 13)

Replaces the Prompt 0.2 `UsersPage` placeholder ("super_admin only, once a
staff-provisioning endpoint exists") with a real, super_admin-only staff
directory and account-lifecycle management surface.

## 0. Reconnaissance summary

Performed before any code was written, per this prompt's own explicit
reconnaissance-first mandate. Findings that shaped every downstream
decision:

- No Supabase Auth **Admin API** client (service-role-keyed
  `@supabase/supabase-js`) existed anywhere in the backend. The only prior
  `createClient()` call (`otpSender.ts`) is explicitly anon-keyed.
- `requireSuperAdmin()` (`apps/api/src/lib/auth/guards.ts`) existed but had
  never been used by any route — every other staff route uses the standard
  `reception_warden/hostel_admin/super_admin` 3-role set.
- `staff` had **no status/active column** — "deactivate a staff member" was
  structurally impossible, not merely unbuilt in the UI.
- `docs/current-state.md` already scoped a future staff-provisioning
  capability to "basic provisioning only," with anything beyond that
  explicitly deferred.
- No `GET /hostels`-shaped endpoint exists anywhere in this API — hostel
  names only ever appear as a joined display field on responses that are
  already scoped some other way (e.g. `leave-requests/queue`). Building a
  hostel-listing endpoint for a name-based picker was judged out of this
  prompt's scope, matching `StaffIdentity.tsx`'s own long-standing,
  identical precedent ("this app has no hostel-name lookup service...
  building one would be a business API, out of scope").

## 1. Capability classification

| Capability | Status | Notes |
|---|---|---|
| Staff directory (list/detail/statistics) | IMPLEMENTED | `GET /staff`, `/staff/statistics`, `/staff/{id}` |
| Staff creation | IMPLEMENTED | `POST /staff` — real Admin API invite, no password ever handled by this backend |
| Role change | IMPLEMENTED | `PATCH /staff/{id}/role` |
| Hostel assignment change | IMPLEMENTED | `PATCH /staff/{id}/hostel` |
| Status (active/suspended) | IMPLEMENTED | `PATCH /staff/{id}/status`, real request-time enforcement |
| Password reset | IMPLEMENTED | `POST /staff/{id}/reset-password` — triggers Supabase's own recovery email |
| Force sign-out | IMPLEMENTED | `POST /staff/{id}/force-sign-out` — Admin API global session revocation |
| Custom/dynamic role creation | DEFERRED / REQUIRES ADR | `staff_role` is a fixed DB enum, not a data model — "create role" as a UI feature would fabricate a capability the backend cannot enforce |
| Per-user custom permissions | DEFERRED / REQUIRES ADR | Permissions are static, role-derived constants (`lib/authorization/policy.ts`) — no per-user grant table exists |
| Session listing / per-session revocation | DEFERRED / REQUIRES ADR | No `sessions` table exists; the installed Admin API SDK exposes only whole-account `signOut`, not per-session enumeration |
| MFA admin reset | DEFERRED / REQUIRES ADR | Zero existing backend support; resetting a factor is high-risk (a wrong implementation silently disables a security control) and no approved mechanism exists — no fake button was built |
| Multi-hostel assignment | DEFERRED (matches ADR) | `staff.hostel_id` is a single nullable column — the existing model was reused, not extended |
| Staff-facing notifications for these events | DEFERRED (matches prior prompts) | Notification Center's own already-documented capability gap (no `staff` recipient type) is unchanged by this prompt |

## 2. Database changes

- `staff_status` enum (`active`, `suspended`) — migration `0021`.
- `staff.status` column, `NOT NULL DEFAULT 'active'`, indexed.
- `staff_enforce_self_update_columns()` trigger extended twice:
  1. Deny-list extended to also reject `new.status is distinct from old.status`
     for a non-super-admin self-update (the QG-01/F-QG03-09 "new column
     isn't automatically covered" lesson, applied proactively).
  2. `auth.uid() is null or ...` exemption added — the trigger is
     `SECURITY INVOKER` and fires even for Fastify's own service-role
     connection (unlike an RLS *policy*, a trigger is not bypassed by that
     connection); before this fix, Fastify's own trusted backend could
     never update `role`/`hostel_id`/`status` on any `staff` row. See the
     migration's own header comment for the full analysis.

pgTAP: `25_prompt13_staff_status_self_update_guard.sql` (8 assertions).
Full suite: **355/355**, re-verified on a fresh `supabase db reset`.

## 3. Backend

New domain (`apps/api/src/domain/staff/`): `types.ts`, `errors.ts`,
`repository.ts` (`DrizzleStaffRepository`), `service.ts`
(`StaffAdminService`), `__fixtures__/fake-repository.ts`.

New `apps/api/src/lib/auth/staffIdentityAdmin.ts` — the first service-role
Supabase Admin API client in this codebase (`inviteStaffUser`,
`deleteAuthUser`, `forceSignOut`, `sendPasswordResetEmail`). Justified as
the standard Supabase mechanism for admin-driven provisioning, not a
second identity system — ADR-014 already established Supabase Auth as the
canonical identity provider.

Routes (`apps/api/src/routes/staff.ts`), all gated by
`[app.authenticate, requireSuperAdmin(), requireAal2()]`:

- `GET /staff`, `GET /staff/statistics`, `GET /staff/{id}`
- `POST /staff`
- `PATCH /staff/{id}/role`, `PATCH /staff/{id}/hostel`, `PATCH /staff/{id}/status`
- `POST /staff/{id}/reset-password`, `POST /staff/{id}/force-sign-out`

Rate limiting: `RATE_LIMIT_STAFF_ADMIN` (10/60s, mirrors
`RATE_LIMIT_OTP_REQUEST`'s reasoning for costly/sensitive external-API-backed
actions) on `POST /staff`; the read endpoints reuse the existing, more
generous `staffQueue` tier.

## 4. Security defenses (all server-enforced, independent of any UI restriction)

- **Self-escalation**: every mutation checks `targetStaffId === actingStaffId`
  first and returns `self_target_forbidden` (403) — applied uniformly
  across role/hostel/status/reset-password/force-sign-out.
- **Last-active-super-admin protection**: a real `COUNT(*)` query, checked
  only when the mutation would remove the target's active-super_admin
  status, correctly excluding only the target (not the actor) so demoting
  a *different* admin remains possible. Returns `last_super_admin_protected`
  (409) when it would leave zero active super_admins.
- **Hostel-required-role validation**: `reception_warden`/`hostel_admin`
  require a non-null `hostelId`; enforced on create, role-change (checks
  target's current hostel), and hostel-change (checks target's current
  role).
- **Never-return-password discipline**: creation uses
  `auth.admin.inviteUserByEmail()` (no password parameter at all); reset
  uses `auth.resetPasswordForEmail()`. Neither method's return value nor
  any API response ever contains a password.
- **Audit**: every successful mutation writes one `audit_logs` row via the
  existing Prompt-12 architecture — transactionally inline for DB-only
  mutations (role/hostel/status), fire-and-forget for the two mutations
  that call an external Admin API (reset-password, force-sign-out).
- **Request-time suspension enforcement**: `findStaffByAuthUserId`
  (`apps/api/src/lib/auth/db-port.ts`) filters `status = 'active'` — a
  suspended staff member's very next authenticated request fails closed
  with `401 no_app_profile`, live-verified in this task's own browser
  session (see §7).

## 5. Frontend

- `services/staff/StaffService.ts` — thin transport wrapper, mirrors
  `AuditService.ts`'s pattern exactly.
- `features/staff/{useStaffDirectory,useStaffStatistics,useActingStaffId,useStaffMutations}.ts`
  — TanStack Query, mirrors `features/audit/`'s pattern.
- `components/staff/{StaffTable,StaffFilterBar,StaffDetailPanel,StaffStatisticsStrip,CreateStaffDialog,RoleChangeDialog,HostelChangeDialog,StaffRoleLabel}.tsx`
  — reuses `Table`/`Dialog`/`ConfirmationDialog`/`FormField`/`SearchInput`/`StatusBadge`
  primitives throughout; no new primitive was created.
- `pages/UsersPage.tsx` — real page, replacing the Prompt 0.2 placeholder,
  gated by the existing `users:manage` permission (already granted to
  `super_admin` only since Prompt 3 — reused unchanged).
- Hostel assignment is a plain UUID text field throughout (create dialog,
  hostel-change dialog) — never a name dropdown, per the reconnaissance
  finding above.
- `actingStaffId` (via `staffProfileService.getMyStaffProfile()`, reused
  unmodified) disables self-targeting controls in the UI for a better UX —
  this is explicitly **not** the security boundary; every mutation
  independently re-verifies `self_target_forbidden` server-side regardless
  of what the UI allowed to be clicked.

## 6. Bugs found and fixed during this task's own verification

1. **`registerStaff()` eagerly constructed its Supabase Admin API client**
   even when a test supplied a `staffRepository` override that made it
   unnecessary — breaking 13 pre-existing test files that call `buildApp()`
   without Supabase credentials configured. Fixed by making the
   construction lazy (only evaluated if actually needed), then adding
   `staffOverrides: { staffRepository: new FakeStaffRepository() }` to
   every pre-existing `buildTestApp()` helper that didn't yet have it,
   mirroring `otpAuthOverrides`'s identical established convention.
2. **`staffProfileService.getMyStaffProfile()` — a real, previously-latent
   bug in pre-existing Prompt-3 scaffolding, found live by this task's own
   browser verification** (the first time any prompt in this session's
   history signed in as `super_admin`): the query relied entirely on RLS
   to scope the result to "my own row," but `staff_all_super_admin` (QG-01)
   is a *second*, broader SELECT policy that also matches for that role —
   Postgres OR's every applicable policy together, so the unfiltered query
   returned all 6 staff rows instead of 1, and `.maybeSingle()` rejected
   with "multiple (or no) rows returned," blocking **every super_admin
   from ever completing sign-in** in this application. Fixed by explicitly
   filtering `.eq("auth_user_id", session.user.id)` rather than relying on
   RLS alone for uniqueness — RLS still applies on top, so this does not
   weaken authorization, it only makes the query deterministic. 4 new
   regression tests. Live-reverified: super_admin sign-in now completes
   correctly.
3. **`Dialog.module.css` had no explicit `background`/`color`** — the
   native `<dialog>` element's UA default (white background) was showing
   through in dark mode, since CSS custom properties on child elements
   don't retroactively theme the host element. Found live via this task's
   own `ConfirmationDialog` verification (every ConfirmationDialog/Dialog
   usage across the whole app shares this component). Fixed by adding
   `background: var(--color-surface); color: var(--color-text-primary);`
   to `.dialog` — visually re-verified correct afterward.

## 7. Live verification (real local Supabase + a real running `apps/api`, real browser)

Performed as `superadmin1@example.test` (a real password + genuinely
enrolled/verified TOTP factor, reaching real AAL2 — no forged token
anywhere):

- Users & Access page renders real, server-derived statistics (6 total, 6
  active, 0 suspended, correct per-role breakdown) and the real staff
  directory table.
- Opened "Test Reception Warden"'s detail panel — real identity fields,
  real hostel name, real timestamps.
- **Suspend → confirm**: real `200`, status badge flips to "Suspended," a
  real success toast appears, and the directory/statistics both
  re-fetch and update live.
- **Independently re-verified the suspension is real, not just a UI
  state**: signed in as the now-suspended `reception1@example.test`
  directly against local Supabase Auth (still succeeds — suspension is not
  an Auth-layer block, by design) and then called
  `GET /api/v1/leave-requests/queue` with that real, valid session token —
  received `401 no_app_profile`, proving `findStaffByAuthUserId`'s
  request-time enforcement is genuinely active.
- **Reactivate → confirm**: real `200`, staff member usable again;
  directory/statistics both correctly return to 6 active / 0 suspended.
- **Create Staff Account**: filled a real form (full name, email, role,
  a real seeded hostel UUID), submitted, received a real `201` and a
  success toast ("... was invited as reception_warden"); Total Staff went
  6 → 7 and the Reception Warden count incremented — confirming the real
  Admin API invite call and the real `staff` row insert both happened.
  Cleaned up afterward (test-only `staff`/`auth.users` rows deleted
  directly, database returned to the clean seeded baseline — matching
  this project's own established live-verification cleanup convention).

## 8. Deliberately not built (and why)

- A hostel-name picker/dropdown — no hostel-listing capability exists
  anywhere in this application (§0); building one was out of this
  prompt's scope, matching `StaffIdentity.tsx`'s identical precedent.
- MFA reset, session listing/revocation-by-session, custom roles, per-user
  permissions, multi-hostel assignment — see §1's classification table.
- A staff-facing notification for any of these lifecycle events — the
  Notification Center's own, already-documented capability gap (no
  `staff` recipient type, no INSERT policy for any client role) is
  unchanged; not worked around here.
