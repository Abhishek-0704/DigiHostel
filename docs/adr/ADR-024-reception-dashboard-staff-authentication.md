# ADR-024: Reception Dashboard Staff Authentication Mechanism

- **ADR ID:** ADR-024
- **Title:** Reception Dashboard Staff Authentication Mechanism (Password + MFA)
- **Status:** ACCEPTED
- **Date:** 2026-09-14
- **Related ADRs:** ADR-001 (Client Application Architecture — Reception Warden/Hostel Admin/Super Admin are web-dashboard-only roles), ADR-014 (Supabase Auth as canonical identity provider — this decision extends it, not replaces it), ADR-020 (OTP delivery for parents — a different mechanism for a different role class, not reused here), ADR-023 (Reception Dashboard web framework).

## Decision

Reception Dashboard staff (Reception Warden, Hostel Administrator, Super Administrator) authenticate with **Supabase Auth password sign-in (`signInWithPassword`) followed by mandatory Supabase Auth native Multi-Factor Authentication (TOTP factor, via `auth.mfa`)**. A session is not treated as authorized for any protected route until Supabase's own Authenticator Assurance Level reaches `aal2` (`supabase.auth.mfa.getAuthenticatorAssuranceLevel()`). No custom TOTP/cryptographic implementation is introduced; Supabase Auth owns factor secrets entirely (its own `auth.mfa_factors` table, outside this repository's schema/RLS).

## Context

Prompt 0.1 (`docs/reception-dashboard-architecture.md` §16) left the staff authentication *mechanism* as an open decision (draft options: password+MFA, magic link, institutional SSO), correctly distinguishing it from the already-settled *identity provider* (ADR-014, Supabase Auth). This task's own instruction set now states Password + MFA is an accepted product/security requirement for this specific application — a stricter posture than the Parent App's OTP-based flow (ADR-020), justified by the Reception Dashboard's administrative/operational nature (it can trigger parent-approval sessions and, once built, staff-verified departures — a materially higher-privilege surface than a parent's own leave decisions).

Verified before accepting this ADR: no MFA implementation, TOTP handling, or AAL-checking code exists anywhere in this repository (confirmed by direct repository-wide search); `@supabase/supabase-js@2.113.0` (already a dependency of `apps/reception-dashboard`, ADR-023) genuinely exposes a public `auth.mfa: GoTrueMFAApi` with `enroll`/`challenge`/`verify`/`unenroll`/`listFactors`/`getAuthenticatorAssuranceLevel` (confirmed by reading the installed package's own type declarations, not assumed from documentation memory).

## Options Considered

- **Supabase Auth password + native TOTP MFA (`auth.mfa`)** — selected. No new vendor, no custom cryptography, no manually-stored secrets; matches ADR-014's "Supabase Auth owns identity/session lifecycle" principle directly; TOTP (authenticator-app) needs no SMS/phone provider, avoiding the same kind of unjustified vendor dependency ADR-020 already reasoned about for parent OTP delivery.
- **Magic link (passwordless)** — rejected for this application: this task's explicit requirement is password + MFA specifically, and a magic-link-only flow has no natural "password" step to layer MFA onto in the conventional sense.
- **Institutional SSO (KIIT)** — rejected: no SDD or prior ADR evidence this integration exists or is planned; would be a significant, unjustified new integration.
- **Custom/manual TOTP implementation** — rejected: reimplements a solved problem Supabase Auth already provides natively, and would require this application to store and protect TOTP secrets itself — directly contrary to this task's explicit "do not store TOTP secrets manually in application tables" instruction and to Defense in Depth generally.

## Consequences

- `apps/reception-dashboard/src/services/auth/mfaService.ts` (new, this task) wraps `auth.mfa.*` for TOTP only — no phone/WebAuthn factor is wrapped (not a current requirement).
- `apps/reception-dashboard/src/contexts/authStatus.ts` gained an `"mfa_required"` state, distinct from `"unauthenticated"` and `"authenticated"` — a password-only session (`aal1`, whether or not a factor is even enrolled yet) is never treated as sufficient for a protected route (`RequireAuth`). This is a state-architecture change only; no login or MFA UI was built (explicitly out of this task's scope).
- A staff-provisioning flow (still unbuilt — `docs/reception-dashboard-architecture.md` §13 item 4) will need to also handle initial password issuance and MFA enrollment invitation; that flow's exact shape (e.g. temporary password + forced enrollment on first login vs. an invite-link flow) is not decided by this ADR and is deferred to Phase 1/5 implementation.
- MFA recovery (lost authenticator device) is explicitly **not designed** by this ADR — any future recovery mechanism must be server/Supabase-Auth-authorized (e.g. a super_admin-triggered factor removal via Supabase's admin API), never a client-side bypass, per this task's explicit prohibition on insecure fallbacks.
- Backend impact: `apps/api`'s own JWT verification (`apps/api/src/lib/auth/jwt.ts`, ADR-014) does not currently distinguish AAL — whether the backend should also enforce `aal2` server-side (not just the frontend's route guard) is a real, open implementation question for Phase 1, flagged here rather than assumed either way.
- No database schema or RLS change — Supabase Auth's MFA tables are entirely outside `packages/db`'s schema.

## Rejected Alternatives

Magic link, institutional SSO, and a custom TOTP implementation, as above — each either doesn't match the accepted requirement or reintroduces risk/vendor dependency Supabase Auth's native mechanism already avoids.

## Implementation References

(Added post-acceptance per `docs/adr/README.md`'s permitted-changes list — "adding implementation references" — the Decision/Context/Consequences above are unchanged.)

- Backend AAL2 enforcement (this ADR's own Consequences named it an open question): implemented in `apps/api/src/lib/auth/guards.ts`'s `requireAal2()`, Prompt 3 (RBAC & Authorization Framework). See `apps/reception-dashboard/docs/authorization.md`.
- Frontend authorization/RBAC layer built on top of this mechanism: `apps/reception-dashboard/src/lib/authorization/`, `apps/reception-dashboard/src/contexts/AuthorizationContext.tsx` — Prompt 3.
- The `aal`/`amr` JWT claim shape this ADR's mechanism relies on was empirically verified against a real local Supabase instance during Prompt 3 (a genuine password sign-in followed by a real TOTP enroll+challenge+verify round-trip), not assumed from documentation.
- Full authentication infrastructure (real `authService.signIn`, session lifecycle, administrative inactivity timeout, logout, staff authentication audit logging via a new `POST /auth/staff/audit-events` endpoint) implemented Prompt 1 (Authentication Infrastructure), including a second full empirical end-to-end verification against a real running `apps/api` process + local Supabase — password sign-in through a genuinely blocked AAL1 request through real TOTP verification through a genuinely permitted AAL2 request, with resulting audit rows confirmed directly in the database. See `apps/reception-dashboard/docs/authentication.md`.
- CORS (`apps/api/src/app.ts`'s `resolveCorsOrigins()`) and staff-auth-specific rate-limiting status resolved/documented, same prompt — see `authentication.md`'s own CORS/rate-limiting sections.
