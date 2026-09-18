# Reception Dashboard — RBAC & Authorization Architecture (Prompt 3)

This document covers the reusable authorization foundation built in Prompt 3 (RBAC & Authorization Framework). It extends, and should be read alongside, [`docs/architecture.md`](architecture.md)'s "Authentication & MFA architecture" section and [`authentication.md`](authentication.md) (Prompt 1 — Authentication Infrastructure, the real password+MFA/session/audit foundation this authorization layer builds on) — those cover *authentication* (who are you), this one covers *authorization* (what are you allowed to do). **Authentication ≠ Authorization**, and **frontend authorization ≠ the security boundary** — both distinctions are load-bearing throughout everything below, not just stated once.

## Status

No business feature is implemented. Login/MFA UI is still not implemented (Prompt 2's job — not yet run, see the "A note on prompt sequencing" section at the end of this document). Authentication INFRASTRUCTURE (password sign-in, MFA, session lifecycle, backend AAL2 enforcement) has since been genuinely built — see [`authentication.md`](authentication.md). This document's own subject, the authorization mechanism, was built earlier (Prompt 3) and remains as described below: permission taxonomy, role→permission policy, an `AuthorizationContext` that resolves a real staff profile once a session is genuinely authenticated, route/component authorization primitives, and — closing a CRITICAL gap `docs/reception-dashboard-architecture-security-review.md` (Prompt 0.3) found — real backend AAL2 enforcement on the one staff route that exists today.

## The full chain

```
Password
  ↓
TOTP MFA
  ↓
AAL2  (Supabase Auth's own claim — apps/reception-dashboard/src/contexts/authStatus.ts)
  ↓
Staff Identity  (apps/reception-dashboard/src/services/auth/staffProfileService.ts — RLS-protected self-row read)
  ↓
Role  (apps/reception-dashboard/src/types/roles.ts — mirrors packages/db/src/schema/enums.ts's staff_role exactly)
  ↓
Permission  (apps/reception-dashboard/src/lib/authorization/policy.ts — ROLE_PERMISSIONS)
  ↓
Hostel Scope  (policy.ts's canAccessHostel)
  ↓
Backend Authorization / RLS  (apps/api/src/lib/auth/guards.ts, packages/db/src/schema/*.ts — THE security boundary)
```

Everything above "Backend Authorization / RLS" exists only in the browser and is UX. Nothing above that line is ever trusted by the backend; nothing below it is ever bypassable from the frontend.

## Role model

Exactly the four roles in `packages/db/src/schema/enums.ts`'s `staff_role` enum — `reception_warden`, `hostel_admin`, `super_admin` are Reception Dashboard roles (ADR-001); `library_incharge` is not (it belongs to the future Library Dashboard) and is granted zero permissions here.

**"Head Warden"** — this prompt's own instructions again asked this role to be supported. It is **not** represented anywhere in this authorization layer, re-confirmed by re-checking the schema/RLS/SDD during this prompt (not merely carried forward from Prompt 0.1's original finding unchecked): no `staff_role` enum value, no RLS policy, no Fastify guard could ever authorize it end-to-end. Adding it to the frontend alone would be authorization theater. **REQUIRES DECISION** — a future ADR adding a real enum value + RLS + guard coverage is the only path to genuinely supporting it. See `types/roles.ts`'s doc comment for the full reasoning.

## Permission model

`src/lib/authorization/permissions.ts` declares every permission as a single source of truth (`PERMISSIONS` const array + `Permission` type), namespaced `<module>:<capability>`, matching the category list this prompt specified: dashboard, notifications, leave, student, movement, emergency, health, audit, reports, users, configuration, system.

`src/lib/authorization/policy.ts` maps each real role to its permission set (`ROLE_PERMISSIONS`) — a plain static table, not a database-driven system (deliberately: "don't introduce database complexity solely for theoretical flexibility," and a static table can migrate to a real endpoint later without any caller changing, since every consumer only ever sees the `Permission[]` shape). **This mapping is INFERRED**, grounded in SDD Ch.7 §7.5's coarse role table and this prompt's own responsibility-boundary description, not a precise product-approved grant table — flagged for refinement once the product supplies exact per-permission grants.

Every check (`hasRole`, `hasPermission`/`can`, `hasAnyPermission`, `hasAllPermissions`, `canAccessHostel`) is a pure function, unit-tested (`policy.test.ts`, 16 tests) without React or Supabase, and **fails closed on `null`** — no authorization state ever defaults to permissive.

## Authorization state

- **`AuthorizationContext`** (`src/contexts/AuthorizationContext.tsx`) — a context SEPARATE from `AuthContext`, consuming it rather than duplicating session state. Only attempts to resolve a staff profile once `AuthContext`'s `status === "authenticated"` (password+MFA/AAL2-verified). Exposes `role`, `hostelId`, `permissions`, `isAuthorizationLoading`, `isAuthorized`, `authorizationError`, `hasRole`, `hasPermission`, `can`, `canAccessHostel`, `refreshAuthorization`.
- **`staffProfileService.getMyStaffProfile()`** (`src/services/auth/staffProfileService.ts`) — the authoritative source: a direct, RLS-protected Supabase read of the caller's own `staff` row (`staff_select_own`: `auth_user_id = auth.uid()`). **Empirically verified this prompt** against a real local Supabase instance: a real `reception_warden` JWT reading `staff` — with an unrestricted `select=*` — still returns exactly one row, the caller's own, never another staff member's. No new Fastify endpoint was added for this; RLS already makes the direct read safe, and no business table is queried anywhere in this app.
- **`authorizationState.ts`** — pure derivation (`deriveAuthorizationState`), unit-tested (5 tests) separately from the React context, mirroring `authStatus.ts`'s own separation.
- Fails closed on every edge: authentication incomplete → not loading, not authorized; profile fetch in flight → loading; profile fetch fails → treated identically to "no staff row," never a stale/previous profile.

## Route protection

- **`RequireAuth`** (`src/routes/RequireAuth.tsx`) — authentication + AAL2 only. **Rewritten this prompt** from a deny-list (redirect on known-bad statuses, fall through to authorize) to an explicit allow-list (`status === "authenticated"` is the only path to children; everything else, including a hypothetical future status, denies) — closing the Prompt 0.3 ASRB MAJOR finding. Regression-tested (`RequireAuth.test.tsx`, 6 tests, including one that simulates an unrecognized future status and confirms it still denies).
- **`RequireRole`** (`src/routes/RequireRole.tsx`) — now genuinely functional (Prompt 0.2's version always denied via a hardcoded stub). Fails closed on loading/no-match; renders `AccessDeniedMessage` **in place**, never redirects to `/login` — an authenticated-but-wrong-role staff member is not funneled back through the login flow to hide the real problem.
- **`RequirePermission`** (`src/routes/RequirePermission.tsx`, new) — the primary route-level primitive; every real page route in `routes/index.tsx` now declares its permission requirement (`/settings` and `/help` are intentionally ungated — personal/universal pages, not administrative modules).

## Component authorization

- **`Can`** (`src/components/authorization/Can.tsx`) — one flexible component (`permission` | `anyPermission` | `role` props) rather than separate `PermissionGuard`/`RoleGuard` duplicates, deferring to the exact same `AuthorizationContext` checks route guards use. Defaults to silently hiding `children`; accepts an explicit `fallback` (e.g. `<AccessDeniedMessage />`) when a visible denial is wanted instead.
- **`AccessDeniedMessage`** (`src/components/authorization/AccessDeniedMessage.tsx`) — reuses the existing `ErrorState` primitive (`role="alert"`, non-color-only) rather than inventing a second visual language for "forbidden."

No business control exists yet to actually wrap with `Can` — these are the primitives future feature prompts will use.

## Navigation authorization

`Sidebar.tsx` filters its nav items through `useAuthorization().hasPermission` — the **same** function `RequirePermission` uses, per this prompt's explicit "navigation visibility must derive from the same centralized authorization model" requirement. While authorization is loading, the sidebar shows nothing rather than flashing every item and then hiding most of them.

## Hostel / resource scope

`policy.ts`'s `canAccessHostel(staff, targetHostelId)` — `super_admin` unscoped (matches every existing RLS policy's own shape), every other role requires an exact, non-null hostel match; a scoped role with a null hostel assignment (a data anomaly) is denied, never treated as unscoped. UX-layer only — no business query reads a hostel id from anywhere in this app yet, so this exists as a ready primitive, not something currently exercised end-to-end.

## Backend authorization — AAL2 enforcement (the actual security boundary)

Closing the Prompt 0.3 ASRB's CRITICAL finding directly:

- **`SupabaseJwtClaims`** (`apps/api/src/lib/auth/types.ts`) gained `aal`/`amr` fields. **Empirically verified this prompt**, not assumed: against a real local Supabase instance, a password-only sign-in produces `aal: "aal1"`; a real TOTP enroll+challenge+verify round-trip (a real computed 6-digit code, not a stub) produces `aal: "aal2"` with `amr: [{method:"totp",...},{method:"password",...}]`.
- **`requireAal2()`** (`apps/api/src/lib/auth/guards.ts`) — a new guard, composed **after** `requireStaffRole` (so a non-staff caller is rejected with `role_required`, never `insufficient_assurance` — AAL2 is about how strongly a *staff* member proved their identity, not who's allowed to attempt the route). Fails closed on a missing/undefined `aal` claim, not just a non-`"aal2"` one.
- **Wired onto `POST /leave-requests/:id/expire`** — the one existing staff-facing route in the product today, and therefore the one place the ASRB's finding was concretely (not just hypothetically) exploitable. New test: a correctly-roled, correctly-hostel-scoped `reception_warden` token *without* `aal2` now gets `403 insufficient_assurance`, never `200` (`apps/api/src/routes/leave.test.ts`).
- No business endpoint was added. No leave/student/emergency/health API was implemented.

**Not resolved by this work** (explicitly, not silently): whether every *future* staff route should also carry `requireAal2()` by convention (this prompt establishes the primitive and applies it to the one route that exists; a blanket policy for future routes is a design note for whoever adds the next staff route, not decided here).

## Supabase / RLS relationship

No RLS policy was changed. No new table was created. The frontend's authorization state is read-only UX built on top of the same RLS that already protected every table before this prompt — `staffProfileService`'s query is safe specifically *because* `staff_select_own` already existed and already scoped it correctly.

## Security summary

- Client-side role/permission spoofing: irrelevant — the backend never reads a client-supplied role/permission, only re-resolves from Postgres (unchanged) and now additionally checks `aal` from the verified JWT itself (a Supabase-asserted claim, not client-supplied).
- AAL1 → protected-staff-API bypass: closed for the one route that exists (`requireAal2()` on `/expire`), verified with a real 403 test, not just a design claim.
- Cross-hostel access: unaffected (existing RLS hostel-scoping, untouched).
- Realtime authorization: unaffected — no business-table subscription exists yet; RLS would scope any future one exactly as it scopes REST reads today. Documented, not implemented (nothing to authorize yet).
- Fail-closed discipline: every function/component/guard added this prompt denies by default on `null`/loading/error/unrecognized state — verified by dedicated tests for each (`policy.test.ts`, `authorizationState.test.ts`, `RequireAuth.test.tsx`, `RequireRole.test.tsx`, `RequirePermission.test.tsx`, `guards.test.ts`).

## Developer usage guidance

- Need to gate a whole route? Add a `permission` to `routes/index.tsx`'s `withPermission(...)` call — do not write a new `if (role === ...)` anywhere.
- Need to gate one control inside a page? Wrap it in `<Can permission="...">`.
- Need a new permission? Add it to `permissions.ts`'s `PERMISSIONS` array once, then grant it to the appropriate role(s) in `policy.ts`'s `ROLE_PERMISSIONS` — nowhere else needs to change.
- Never write a role/permission string literal directly in a component or page.

## Open decisions (unchanged from Prompt 0.3, not silently closed here)

Staff provisioning, MFA recovery, CORS configuration, and the exact per-permission product grant table remain open — see `docs/reception-dashboard-architecture-security-review.md` and `docs/reception-dashboard-architecture.md` §35 for the full list. This prompt did not resolve any of them; it built the mechanism that will consume the answers once they exist.

## A note on prompt sequencing

At the time this document was first written, this prompt's own instructions stated Prompts 1 (Authentication Infrastructure) and 2 (Login Experience) had already been completed. **Direct inspection at the time found otherwise**: `src/pages/LoginPage.tsx` was still Prompt 0.2's exact placeholder, no `signInWithPassword` call existed anywhere, and `apps/api` had zero AAL/AMR awareness. Per this repository's own source-of-truth hierarchy, that discrepancy was recorded rather than silently accepted.

**Update**: Prompt 1 (Authentication Infrastructure) has since genuinely been implemented — see [`authentication.md`](authentication.md) for the full account, including empirical end-to-end verification against a real running `apps/api` + local Supabase instance. `authService.signIn`, native TOTP MFA, backend AAL2 enforcement, session lifecycle/timeout/logout, and audit logging are all real now.

**Second update (Prompt 2, Login Experience)**: the real login/MFA UI now exists — see [`login-experience.md`](login-experience.md). As predicted immediately above, this authorization layer required zero changes to support it: `LoginPage` consumes `useAuthorization()` exactly as this document already specified (resolve staff profile only once `AuthContext.status === "authenticated"`, redirect to the dashboard only once `isAuthorized`, show a denial — never auto-provision — for `unauthorized_staff`). No role/permission/hostel value is read from anywhere client-supplied by the new UI; `staffProfileService`'s existing RLS-protected read remains the only source.
