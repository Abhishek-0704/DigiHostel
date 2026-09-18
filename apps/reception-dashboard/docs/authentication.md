# Reception Dashboard — Authentication Infrastructure (Prompt 1)

This document covers Prompt 1's deliverable: the real authentication foundation (password sign-in, native TOTP MFA, AAL2 enforcement, session lifecycle, timeout, logout, audit logging) that Prompt 2's login UI consumes. It extends [`architecture.md`](architecture.md)'s "Authentication & MFA architecture" section and [`authorization.md`](authorization.md) (the separate RBAC layer this builds on). **The login/MFA UI itself is [`login-experience.md`](login-experience.md) (Prompt 2)** — it consumes every mechanism below unchanged; nothing in this document needed to change to support it.

## A note on prompt sequencing

This prompt's own stated context claimed Prompts 1 and 2 were already complete. Direct inspection at the start of this task found `LoginPage.tsx` was still Prompt 0.2's placeholder and no `signInWithPassword` call existed anywhere — the same discrepancy `authorization.md`'s own closing note already recorded for Prompt 3. This prompt (the real "Prompt 1") is what actually builds the pieces the earlier prompt's context assumed already existed.

## Accepted mechanism (ADR-024, unchanged, not reopened)

Supabase Auth email+password + native TOTP MFA. AAL1 (password only) is never sufficient; AAL2 (password + verified TOTP) is required for protected staff operations. This prompt implements that mechanism; it does not revisit the decision.

## Password authentication

`authService.signIn(email, password)` (`src/services/auth/authService.ts`) — the one real Supabase Auth call added this prompt. Calls `supabase.auth.signInWithPassword` directly; on success returns the resulting session (`aal1` at this point — MFA is a separate, subsequent step); on failure throws a sanitized `AppError` via `mapAuthError` (`src/services/auth/authErrors.ts`), never the raw Supabase error. No password is ever logged (grepped this file and `authErrors.ts`: no `password` value reaches `logger` anywhere) and none is persisted by this application — Supabase's own SDK owns the resulting token entirely.

## MFA / TOTP

`mfaService` (`src/services/auth/mfaService.ts`, built Prompt 0.2/3, unchanged this prompt except one addition) wraps `supabase.auth.mfa.*` directly — `enrollTotp`, `challenge`, `verify`, `unenroll`, `listFactors`, `getAssuranceLevel`. No custom TOTP algorithm, no manually-stored secret. New this prompt: `isChallengeExpired(expiresAtSeconds)` — a pure helper so a future screen can proactively detect an expired challenge without parsing Supabase's error message.

## AAL2 enforcement — the actual security boundary

**Frontend** (UX only): `contexts/authStatus.ts`'s `deriveAuthStatus` — `"authenticated"` is reached only when `currentLevel === "aal2"` (Prompt 0.2/3, unchanged).

**Backend** (the real boundary, Prompt 3, reused unchanged by this prompt): `apps/api/src/lib/auth/guards.ts`'s `requireAal2()`, composed onto the one production staff-mutating route, `POST /leave-requests/:id/expire`. This prompt inspected every staff-role-gated route in `apps/api` (`grep -rn requireStaffRole apps/api/src/routes`) and found exactly three:

| Route | Mutates sensitive state? | Production? | AAL2 protection |
|---|---|---|---|
| `POST /leave-requests/:id/expire` | Yes (real leave-request state transition) | Yes | **Has it** (Prompt 3) |
| `POST /auth/staff/audit-events` (new, this prompt) | No (audit-trail write only, grants no access) | Yes | Deliberately does not need it — see its own doc comment in `apps/api/src/routes/auth.ts` |
| `GET /_internal/staff-only` | No (`{ok:true}`, no data) | **No** — `apps/api/src/app.ts` registers `test-auth.ts` only when `NODE_ENV !== "production"` | Not applicable — non-production demonstration route |

No route was found that mutates sensitive state and lacks AAL2 protection. Nothing was added or weakened here.

**Empirically verified this prompt**, end-to-end, against a real running `apps/api` process (rebuilt from source, not a stale binary) and a real local Supabase instance — not merely unit-tested:
1. Real password sign-in (`reception1@example.test`) → real `aal1` JWT.
2. That token calling the real `/expire` endpoint → real `403 insufficient_assurance`.
3. A real TOTP enrollment + a genuinely computed 6-digit code, verified → real `aal2` JWT.
4. That token calling the same endpoint → passes the AAL2 gate (`409 leave_request_conflict` — the seeded leave request isn't in `manual_verification`, proving the gate was passed, not that the business action succeeded).
5. Both `POST /auth/staff/audit-events` calls (`sign_in_success` at aal1, `mfa_success` at aal2) returned `204`, and — queried directly from the real `audit_logs` table via PostgREST afterward — both rows are genuinely present with the correct `actor_type`, server-resolved `actor_id`, and action name.

## Session lifecycle

`authService.getSession`/`onSessionChange`/`getAccessToken`/`getUser` (unchanged from Prompt 0.2, `getUser` added this prompt) — Supabase's SDK owns token storage/refresh entirely; this app never manages a token itself (`lib/supabase/client.ts`, unchanged). `AuthContext` reacts to `onAuthStateChange` automatically — no polling, one subscription (`SessionContext`), cleaned up on unmount (unchanged since Prompt 0.2, `apps/parent-mobile`'s own validated pattern).

## Session timeout / inactivity (new this prompt)

SDD Ch.17 names session timeout qualitatively only ("reduce exposure from unattended devices") — confirmed by direct extraction of the SDD docx this prompt, no numeric value specified anywhere. The values below are **INFERRED**, not VERIFIED, exactly like `apps/api/src/config/rateLimit.ts`'s own numeric choices — env-overridable, not hard-coded:

- Idle timeout: 15 minutes (`VITE_SESSION_IDLE_TIMEOUT_MINUTES`)
- Warning-before-expiry window: 2 minutes (`VITE_SESSION_IDLE_WARNING_MINUTES`)

`lib/sessionTimeout/config.ts` (values) + `lib/sessionTimeout/inactivityStatus.ts` (pure `active`/`warning`/`expired` derivation, unit-tested) + `hooks/useInactivityTimer.ts` (the DOM/timer mechanism — a small, efficient event set: `mousedown`/`keydown`/`touchstart`/`visibilitychange`, deliberately never `mousemove`/`scroll`). `AuthContext` wires this: once `status === "authenticated"` and the timer reports `expired`, it calls `signOut("inactivity_timeout")` automatically. **The "you're about to be signed out" warning UI is now built** — `SessionTimeoutWarning` (Prompt 2, `apps/reception-dashboard/docs/login-experience.md`), mounted once in `DashboardLayout`, consuming the `warning` state and `remainingMs`/`resetInactivityTimer` this context already exposed.

## Logout

`authService.signOut()` — verified idempotent directly from the installed `@supabase/auth-js` source this prompt (`_signOut`'s own no-current-session branch skips the admin call entirely and still resolves `{error: null}`), not assumed. `AuthContext.signOut(reason?)` wraps it: reports a `sign_out` audit event first (while the token is still valid), sets `lastSignOutReason`, then calls the service. Calling it twice does not throw or corrupt state (tested).

## Session-expiration UX contract (state only, Prompt 2 builds the UI)

`AuthContext` exposes `lastSignOutReason: "user_initiated" | "inactivity_timeout" | "session_invalid" | null` — distinguishing a deliberate sign-out, an inactivity-triggered one, and an *unexpected* session loss (token refresh failure, remote revocation, another tab signing out — detected the same way `apps/parent-mobile`'s own AuthContext already validated this exact problem: a ref tracking "did WE just call signOut" vs. the session simply disappearing). `mfa_required` vs `mfa_challenge_failed` vs `mfa_verification_failed` are separate, already-existing `AuthStatus`/`AppErrorKind` values (below) — together these are the full contract §17 asked for.

## Authentication guards — unchanged, reused

`RequireAuth` (auth+AAL2, Prompt 3's allow-list fix, untouched this prompt) → `AuthorizationContext` → `RequireRole`/`RequirePermission` (Prompt 3, untouched). Nothing here was duplicated or replaced.

## Staff identity resolution — fail-closed, reused

`AuthorizationContext`/`staffProfileService` (Prompt 3, untouched mechanism) now surfaces the specific reason via `authorizationError`: `unauthorized_staff` (new this prompt — a valid, AAL2-verified identity with no `staff` row, per §20's explicit requirement) is now distinguished from `authorization_unavailable` (the profile *read itself* failed). Both still result in `isAuthorized: false` — the distinction is diagnostic, not a difference in access outcome. **No staff record is ever auto-created** — confirmed no code path does this anywhere in this app or `apps/api`.

## Audit logging

Established pattern (`apps/api/src/domain/device/service.ts`'s `writeAuditLog`), reused, not reinvented: fire-and-forget, try/catch, a write failure never blocks the caller. New this prompt: `apps/api/src/domain/auth/staffAuthAudit.ts` (`recordStaffAuthEvent`) + `POST /auth/staff/audit-events` (OpenAPI-first — `packages/api-spec/openapi.yaml`, codegen re-run) + the frontend counterpart `staffAuthAuditService`.

Only four events are reportable this way — `sign_in_success`, `mfa_success`, `mfa_failure`, `sign_out` — because reporting requires a still-valid bearer token, and `sign_in_failure`/`session_expired` inherently have none. **Those two are covered by Supabase Auth's own internal `auth.audit_log_entries` table** (referenced in `docs/runbooks/disaster-recovery.md`, confirmed to be a real Supabase-managed audit mechanism, not fabricated) — not by an unauthenticated (and therefore spoofable/enumerable) endpoint in this app. `sign_in_success`/`mfa_success`/`sign_out` are fired **reactively** by `AuthContext` from the actual observed state transition (guarded against firing spuriously on a page refresh of an already-established session — tested); `mfa_failure` has no observable state transition (a failed verify leaves the session unchanged) and is reported explicitly by `MfaVerification`'s own catch block (Prompt 2) — the screen that actually catches that error.

**Empirically verified** (see AAL2 section above) — both a `sign_in_success` and an `mfa_success` report landed as real rows in the real `audit_logs` table, queried directly afterward.

## Error taxonomy (extended this prompt)

`lib/errors/errors.ts`'s `AppErrorKind` gained: `session_expired`, `mfa_verification_failed` (a submitted code was wrong/expired — distinct from `mfa_challenge_failed`, which now specifically means *starting* a challenge failed), `authentication_unavailable`, `unauthorized_staff`. Every Supabase Auth error code switched on in `authErrors.ts`'s `classifyAuthApiErrorCode` was read directly from the installed `@supabase/auth-js@2.113.0`'s own `ErrorCode` type — not guessed. No raw Supabase/Postgres error message ever reaches a user-facing string (tested).

## CORS — status: RESOLVED for dev, environment-driven for production

`apps/api/src/app.ts`'s `resolveCorsOrigins()` (new this prompt): explicit `CORS_ALLOWED_ORIGINS` env allow-list if set; otherwise the Reception Dashboard's own real local Vite dev origin (`http://localhost:5173`) outside production; otherwise (`production`, unset) `false` — fails closed, unchanged from before. **No production origin was invented.** A real production/staging deployment of the Reception Dashboard requires `CORS_ALLOWED_ORIGINS` to be set — documented in `env.example`, not silently worked around.

## Rate-limiting — status: mechanism VERIFIED to exist, numeric thresholds UNVERIFIED

Two distinct surfaces:
1. **`apps/api`'s own rate limiting** (`config/rateLimit.ts`) protects only routes registered on `apps/api` — now including the new `staffAuthAudit` tier (20/min, same "moderate staff usage pattern" reasoning as the existing `expire` tier).
2. **Staff password/MFA calls go directly from the browser to Supabase Auth**, never through `apps/api` — this repo's own rate limiting is structurally irrelevant to them (Prompt 0.3 ASRB's own finding, unchanged). This prompt found genuine, verified evidence Supabase Auth has its own platform-level rate-limiting mechanism: `over_request_rate_limit` is a real, documented error code in the installed `@supabase/auth-js` SDK's own `ErrorCode` enum (not merely assumed) — `authErrors.ts` maps it to `authentication_unavailable`. **What remains UNVERIFIED**: the actual numeric thresholds configured for this project (local or any hosted environment) — no live project settings were inspected. Not built: a speculative proxy layer to add application-level protection for these direct-to-Supabase calls, per this prompt's own explicit instruction not to.

## Staff provisioning boundary — REQUIRES IMPLEMENTATION / SEPARATE WORKSTREAM

Unchanged from Prompt 0.3's finding: `staff` INSERT is `super_admin`-only by RLS; no production bootstrap mechanism exists; `supabase/seed.sql` is explicitly local/test-only. This prompt did not build one (correctly out of scope) and does not weaken authentication to compensate — an authenticated identity with no staff row still fails closed (`unauthorized_staff`, above), it is never auto-provisioned.

## MFA recovery boundary — documented operational requirement, fails closed

No recovery mechanism exists or was added. No bypass code, security question, email-only reset, client-side reset, or hardcoded credential was implemented — a parent lost their authenticator device has no path back in through this application; recovery is an out-of-band, super_admin-mediated (or Supabase-admin-API-mediated) operational procedure not yet built, matching ADR-024's own Consequences section.
