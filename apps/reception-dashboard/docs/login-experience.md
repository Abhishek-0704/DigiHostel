# Reception Dashboard — Login Experience (Prompt 2)

This document covers Prompt 2's deliverable: the real login/MFA UI at `/login` that consumes Prompt 1's authentication infrastructure and Prompt 3's authorization layer, without duplicating either. It extends [`authentication.md`](authentication.md) (the infrastructure this UI calls) and [`authorization.md`](authorization.md) (the RBAC layer this UI defers to after AAL2).

## A note on prompt sequencing

This prompt's own stated context again claimed Prompts 1/2 were already complete. Direct inspection at the start of this task confirmed `LoginPage.tsx` was still Prompt 0.2's placeholder — the same discrepancy `authentication.md` and `authorization.md` already recorded for their own prompts. This is the actual Prompt 2.

## Component architecture

```
LoginPage (src/pages/LoginPage.tsx)
 ├── BrandHeader            — institutional title/notice, every step
 ├── LoginForm               — credentials step (status === "unauthenticated")
 │    └── PasswordInput      — reusable show/hide password primitive (components/ui)
 ├── MfaVerification          — MFA step (status === "mfa_required")
 └── AuthFooter               — version/support/copyright, every step

DashboardLayout (src/layouts/DashboardLayout.tsx)
 └── SessionTimeoutWarning    — inactivity-warning banner, every authenticated page
```

`LoginPage` renders exactly one of: a loading indicator, a config-error message, `LoginForm`, `MfaVerification`, an authorization-loading indicator, a `<Navigate>` to the dashboard, an unauthorized-staff notice, or a retryable authorization-error message — chosen by a plain `if`-chain over `AuthContext.status` and `AuthorizationContext`'s derived state, never a separately-tracked "current step" flag that could desync from the real authentication/authorization authorities (§13/§26 of this prompt's own instructions). Session recovery (§16), the AAL1-resumes-into-MFA case, and the unauthorized-staff case (§17) all fall out of this same derivation with no separate code path.

`AuthenticationLayout` (unchanged structurally, widened) wraps `/login` in a centered `Card`; no separate `/mfa-challenge` route exists, per `RequireAuth.tsx`'s own longstanding doc comment.

## Validation

`lib/validation/authFormValidation.ts` (pure, unit-tested) — required email, format-checked (whitespace tolerant), required password (never trimmed, never policy-revealing beyond "required"), and a 6-digit TOTP code check reused by `MfaVerification`. `FormField` (existing primitive) gained a predictable `${htmlFor}-error` id convention so callers can wire `aria-describedby` without the component needing to clone children.

## Password authentication integration

`LoginForm` calls `authService.signIn(email.trim(), password)` (Prompt 1) directly — no direct Supabase call, no duplicate service. On success it does nothing beyond clearing the password field; `AuthContext`'s `status` reactively becomes `"mfa_required"` once the resulting `aal1` session is observed, and `LoginPage` re-renders to the MFA step from that alone. A ref-based re-entrancy guard (`isSubmittingRef`, mirrored in `MfaVerification` as `isVerifyingRef`) is the actual duplicate-submission defense — a React state check alone only reflects reality after a render commits, which is not synchronous enough to guarantee a second `submit` event arriving before that render is rejected.

## MFA/TOTP integration

`MfaVerification` calls `mfaService.listFactors()` on mount, filters for a `factor_type === "totp" && status === "verified"` factor, and — only if one exists — automatically starts a challenge (`mfaService.challenge`). No self-enrollment UI exists anywhere in this component (§10/§37): an account with no verified factor sees a dedicated "not set up, contact an administrator" message and a way back to sign-in, never an enrollment wizard. Submitting a code calls `mfaService.verify` (Prompt 1's real `auth.mfa.verify` wrapper); errors are classified through `mapAuthError` (Prompt 1's real Supabase-Auth-error-code mapping), distinguishing a wrong/expired code (`mfa_verification_failed`) from a challenge that needs restarting (`mfa_challenge_failed`) — the latter is also detected proactively client-side via `isChallengeExpired` before ever calling `verify()` for an already-expired challenge. A failed verify calls `staffAuthAuditService.record("mfa_failure")` — the one audit event `AuthContext` cannot fire reactively (Prompt 1's own documented reason: a failed verify leaves the session's assurance level unchanged, so there is no state transition to react to). A successful verify calls `refreshAssuranceLevel()` — the exact call site `AuthContext`'s own doc comment names for this purpose — as a belt-and-braces nudge; the actual `status` transition to `"authenticated"` is still reactive, not asserted by this component.

## Authentication state & routing

Nothing here computes `authenticated = true` or reimplements `AuthStatus`/`deriveAuthStatus`. `RequireAuth`, `authStatus.ts`, and `AuthContext` are unchanged by this prompt (the file's own doc comment anticipating Prompt 2's shape needed no update). On success, `LoginPage` renders `<Navigate to={ROUTES.dashboard} replace />` — `ROUTES.dashboard` is the existing, real route constant, not a hardcoded literal.

## Authorization integration

`LoginPage` reads `useAuthorization()` (Prompt 3, unchanged) and never redirects to the dashboard until `isAuthorized` is `true`. An AAL2-verified identity with no `staff` row (`authorizationError.kind === "unauthorized_staff"`) is shown a denial with a "Back to sign in" button calling `AuthContext.signOut()` — this screen is the only reachable place that button can live for this exact state, since the dashboard's own `Header`/sign-out button is never reached. A profile-read failure (`authorization_unavailable`) gets a retryable `ErrorState` calling `refreshAuthorization()`. No role/permission/hostel value is read or trusted from anywhere client-supplied — `AuthorizationContext`'s existing RLS-protected `staffProfileService` read is the only source, unchanged.

## Session timeout integration

No second inactivity timer was added. `SessionTimeoutWarning` (new) is mounted once in `DashboardLayout` and reads `useAuthContext()`'s existing `inactivityStatus`/`inactivityRemainingMs`/`resetInactivityTimer` — the exact fields Prompt 1's `AuthContext` doc comment named as "already exposed... for [Prompt 2] to consume." It renders nothing outside the `"warning"` window; `AuthContext`'s own effect (unchanged) still owns the actual `signOut("inactivity_timeout")` call once the timer reports `"expired"`.

## Error handling

Every error path renders through the existing `AppError`/`safeMessageFor` taxonomy (Prompt 1) — no raw Supabase/network error message is ever interpolated into the UI (grepped: no `err.message`/`error.message` is rendered anywhere in `components/auth` or `pages/LoginPage.tsx`). Account-enumeration protection is inherited unchanged from `authErrors.ts`'s existing `invalid_credentials` classification, which does not distinguish "no such account" from "wrong password."

## Accessibility

Every field has a real `<label htmlFor>`; errors carry `aria-invalid` + `aria-describedby` pointing at the `FormField`-rendered `role="alert"` span; loading states use `role="status"`/`aria-live="polite"` (existing `LoadingIndicator`); `PasswordInput`'s toggle is a real `<button type="button">` with `aria-pressed` and an accessible name that itself changes ("Show password" / "Hide password"), not an icon-only control. Focus is moved deliberately: email on initial mount, the first invalid field after a validation error, the password field after a failed sign-in, the code field once an MFA challenge is ready, and the code field again after a failed verification. `prefers-reduced-motion` is inherited from the existing `global.css` rule (unchanged) — no new animation was added that isn't covered by it.

## Responsive design

No new breakpoint logic was added; the existing token-driven `AuthenticationLayout` (widened from a fixed 360px to a fluid `max-width: 440px`) reflows correctly at mobile widths with no horizontal scroll — verified directly in a resized Browser pane (375×812), not merely asserted.

## Version / support placeholder

`vite.config.ts` now inlines `__APP_VERSION__` from `package.json`'s real `version` field (a build-time `define`, the standard Vite pattern) — not a hardcoded/fabricated number; `AuthFooter` reads it. Support contact information has never been defined anywhere in this repository, so the footer states that explicitly as a placeholder rather than inventing a real KIIT contact (§34's explicit instruction).

## Testing

`vitest`/`@testing-library/react`, matching this app's existing convention exactly (no `jest-dom` matchers — this workspace has none installed; plain DOM-property assertions are used throughout, matching `RequireAuth.test.tsx`'s established pattern). New: `PasswordInput.test.tsx` (5), `LoginForm.test.tsx` (12), `MfaVerification.test.tsx` (7), `SessionTimeoutWarning.test.tsx` (4), `LoginPage.test.tsx` (11), `authFormValidation.test.ts` (19), `signOutReasonMessage.test.ts` (5), `formatRemainingTime.test.ts` (4) — 67 new tests. `LoginPage.test.tsx` stubs `LoginForm`/`MfaVerification` so it tests only the step-selection/routing decision, not their internals (already covered in their own files) — deliberately avoiding the same real-Supabase-call timing issue a naive integration test would hit in `jsdom`.

## Real authentication verification (§32)

Performed against a real local Supabase instance (`supabase start`) and a real running `apps/api` process (rebuilt from source), with the Vite dev server's three required env vars supplied as transient shell environment variables — never written to a `.env.local` file, which this repository's own settings deny writing to as a secrets-safety guard. Verified through the actual rendered UI in a browser, not a script:

1. Real password sign-in (`reception1@example.test` / the seed fixture password) → password step → MFA step shown automatically, no separate navigation.
2. Password show/hide toggle genuinely reveals/re-masks the typed value (confirmed via the accessibility tree, not just the screenshot).
3. A TOTP factor was enrolled and confirmed out-of-band (via direct Supabase Auth REST calls — `POST /auth/v1/factors`, `.../challenge`, `.../verify` — simulating what a real staff-provisioning process does once; no enrollment UI exists in this app, consistent with §10), then a genuinely computed RFC 6238 code (via a disposable local script, the same "no application code implements TOTP" boundary this repository has held since Prompt 0.2) was entered through the real MFA form and verified successfully — the app transitioned into the real `DashboardLayout` shell (Sidebar filtered to `reception_warden`'s actual permissions, Header showing the real signed-in email).
4. `staff_sign_in_success` and `staff_mfa_success` rows were confirmed directly in the real `audit_logs` table afterward via `psql` — not merely assumed from a 204 response.
5. Sign-out (`Header`'s existing button) returned to `/login` with the exact `"You have been signed out."` notice (`lastSignOutReason: "user_initiated"`), email field re-focused.
6. A wrong password produced the real sanitized `invalid_credentials` message, form fully recovered (button re-enabled, values preserved) for retry.
7. A wrong TOTP code produced the real sanitized `mfa_verification_failed` message (`"That code isn't correct or has expired. Please try again."`), input cleared and refocused, and a `staff_mfa_failure` row was confirmed in `audit_logs` — followed immediately by a successful retry with a freshly computed code, confirming the retry path and the full audit trail together (`sign_in_success → mfa_success → sign_out → sign_in_success → mfa_failure` in the real table, in that exact order).
8. Responsive layout re-checked at a 375×812 mobile viewport — no horizontal scroll, full-width card, readable text.

No console errors were observed at any step. `apps/api`, the Vite dev server, and the local Supabase stack were all stopped and their transient state (the enrolled TOTP factor, the audit rows, the session) discarded afterward (`supabase stop --no-backup`) — nothing from this verification pass persists.

## Open decisions — unchanged, not silently resolved

Staff provisioning, MFA recovery, Supabase's exact rate-limit thresholds, and a future blanket `requireAal2()` convention remain exactly as `authentication.md`/`authorization.md` already describe them. This prompt did not touch any of them.
