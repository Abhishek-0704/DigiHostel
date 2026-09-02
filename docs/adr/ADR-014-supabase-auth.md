# ADR-014: Supabase Auth as Canonical Identity/Authentication Provider

- **ADR ID:** ADR-014
- **Title:** Supabase Auth as Canonical Identity/Authentication Provider
- **Status:** ACCEPTED
- **Date:** 2026-09-02
- **Supersedes:** ADR-006 (Data Platform) — **partially**: only its auth-strategy conclusion ("Supabase Auth is explicitly not used... the backend implements its own auth... custom JWT claims"). ADR-006's data-platform selection (Supabase managed PostgreSQL + Realtime + Storage) is **not** superseded, is not re-litigated by this ADR, and remains fully in force.
- **Related ADRs:** ADR-002 (Database Domain Model — informed, not superseded, by this decision), ADR-003 (Parent Authentication Device Verification Scope — informed, not superseded), ADR-005 (Backend Architecture — Fastify's auth-verification responsibility changes), ADR-007 (API Architecture — auth-endpoint ownership question raised, not resolved, by this ADR), ADR-009 (Realtime Architecture — authorization model now explicitly tied to this).

> **Methodology caveat, stated up front per this task's instructions:** this ADR was required to be written from current official Supabase documentation, not stale training knowledge. The web research tools in this environment were unavailable for this entire task (the same backend outage encountered in the prior toolchain-architecture task, confirmed not query-specific — retried and still failing). Every Supabase-specific technical claim below (Auth Hooks, JWT structure, Realtime authorization model, RN/Expo session storage pattern) is written from stable, foundational Supabase architecture knowledge that has held roughly steady for some time, but is **explicitly flagged, not silently presented as freshly verified**. `docs/auth-database-security-model.md` carries the same caveat and names exactly which claims need a direct spot-check against current `supabase.com/docs` before implementation begins.

## Decision

**Supabase Auth is the canonical identity and authentication provider for DigiHostel.** It owns: identity records (`auth.users`), session issuance, access-token (JWT) and refresh-token lifecycle, and token revocation. DigiHostel's bespoke security controls — OTP-gated roll-number verification, trusted-device registration, platform attestation, and biometric confirmation — are **not abandoned**. They are re-scoped from "how the base session is issued" (ADR-006's original design, where Fastify minted its own JWTs) to "additional, Fastify/Postgres-enforced gates layered on top of a real Supabase Auth session, required before sensitive operations are permitted." See `docs/auth-database-security-model.md` for the full model.

## Context

ADR-006 rejected Supabase Auth on the grounds that the bespoke OTP+device-trust+biometric+attestation flow "does not map cleanly onto Supabase Auth's standard flows; forcing the fit would add complexity without saving meaningful effort." That evaluation is superseded by this ADR's re-framing: it treated Supabase Auth as an all-or-nothing replacement for the *entire* bespoke flow, rather than as the *session/token substrate* underneath a bespoke flow that still fully exists. Under that narrower framing, the original objection weakens substantially — see Rationale.

## Why Custom Authentication Is Being Replaced

1. **Token issuance/verification/rotation/revocation is a well-solved problem Supabase Auth already implements correctly** — short-lived access tokens, rotating single-use refresh tokens, reuse-detection, admin-triggered session revocation. ADR-006's design required Fastify to reimplement all of this from scratch (signing, rotation, revocation bookkeeping, secret management for the signing key) for no capability gain — none of DigiHostel's bespoke requirements (OTP, device trust, biometric, attestation) actually require Fastify to be the token issuer; they only require Fastify to *gate specific operations* on top of a valid session, which works identically regardless of who issued the underlying token.
2. **RLS and Realtime both expect a Supabase-recognized JWT.** ADR-006 already committed to Supabase Postgres (RLS) and Supabase Realtime (ADR-009), both of which are designed around `auth.uid()`/`auth.jwt()` from a Supabase Auth session. Under ADR-006's original design, Fastify's custom JWTs would need to be shaped and signed compatibly with what RLS/Realtime expect anyway (a nontrivial, easy-to-get-subtly-wrong compatibility surface) — using Supabase Auth directly removes that entire compatibility burden instead of managing it by hand.
3. **Reduced secrets/attack surface.** A custom JWT-signing secret (`JWT_SIGNING_SECRET`, present in the current `env.example`) is a bespoke long-lived secret Fastify must protect, rotate, and never leak — a real, avoidable liability when Supabase Auth already manages equivalent secrets under its own key-management practices.
4. **This is a genuine correction, not a reversal for its own sake.** ADR-006's core reasoning about *why Supabase* (named Realtime requirement, RLS-native fit, reduced ops burden) is unaffected and reaffirmed here. Only the auth-issuance sub-decision was too narrowly evaluated.

## Boundary Between Supabase Auth, Fastify, PostgreSQL/RLS, and Mobile Clients

```text
Supabase Auth        — identity (auth.users), session issuance, JWT/refresh-token
                        lifecycle, revocation. Does NOT know about roll numbers,
                        device trust, biometric state, or parent/student
                        relationships.
      ↓ JWT
Fastify (authentication)
                      — verifies the Supabase-issued JWT is valid, current,
                        and not associated with a revoked session.
      ↓
Fastify (business authorization)
                      — bespoke DigiHostel rules: is this device trusted? was
                        platform attestation satisfied? was biometric
                        confirmation fresh enough for this specific sensitive
                        operation (e.g. approval)? Queries PostgreSQL for the
                        authoritative answer every time — never trusts a JWT
                        claim for anything beyond coarse role/identity.
      ↓
PostgreSQL            — parent/student/guardian relationships, trusted_devices,
                        leave_requests, approvals, library_passes, etc. —
                        all authoritative here, per ADR-002's critical rule
                        (unchanged, reinforced by this ADR).
      ↓
RLS                   — final database-level authorization boundary. Even a
                        bug in Fastify's business-authorization logic cannot
                        let a client read/write rows RLS denies.
```

Mobile clients (`apps/student-mobile`, `apps/parent-mobile`, ADR-004) use the Supabase client SDK for session management (sign-in, token refresh, sign-out), and call Fastify's REST API (ADR-007) for all business operations, which independently re-verifies the JWT and applies business authorization — the mobile client is never trusted merely because it presents a valid Supabase session.

## Security Implications

- **Positive**: removes a bespoke JWT-signing secret from the system; inherits Supabase's maintained token-rotation/reuse-detection; RLS and Realtime authorization become native rather than hand-compatible.
- **New consideration — residual access-token validity window**: a Supabase access token remains valid until its natural (short) expiry even after, e.g., a trusted device is revoked server-side, unless Fastify additionally checks live `trusted_devices` state on every sensitive operation (it must — this was already required by ADR-002/ADR-003's "authoritative in Postgres" rule and remains required here; this ADR does not weaken it).
- **New consideration — device removal must actively revoke the Supabase session**, not just delete the `trusted_devices` row (SDD Ch.4 §4.3–§4.4: "device removal revokes sessions"). Fastify must call Supabase Auth's admin session-revocation capability when a device is removed, not assume passive token expiry is sufficient. Flagged as an implementation requirement in `docs/auth-database-security-model.md`.
- **Unchanged**: platform attestation (ADR-003) and biometric confirmation remain mandatory, Fastify/Postgres-enforced gates on sensitive operations — Supabase Auth has no native concept of either and does not weaken or replace them.
- **Unchanged**: the "client never trusted merely because it possesses a valid JWT" principle — reinforced, not introduced, by this ADR.

## Migration/Implementation Impact

- `apps/api`'s planned auth-verification layer changes from "verify a Fastify-signed JWT" to "verify a Supabase-issued JWT" (via Supabase's JWT secret/JWKS or the Supabase server SDK's user-verification call). No auth middleware exists yet in the current scaffold (per `docs/current-state.md`), so there is no code to migrate — this affects planning only, not existing implementation.
- `packages/db`'s (currently empty, per ADR-002 Phase-9 restriction) future schema must include an `auth_user_id` (or equivalently named) column on `parents` and `students` referencing `auth.users.id` — noted here and in `docs/auth-database-security-model.md`; ADR-002 itself is not rewritten, only informed, since this is an additive column requirement, not a naming conflict.
- `env.example`'s `JWT_SIGNING_SECRET` placeholder and its now-inaccurate "not Supabase Auth" comment are corrected as part of this task (documentation-only change, not business logic — see the updated file).
- The question of *how* the OTP step itself is delivered (Supabase's native phone-OTP provider vs. a custom OTP flow that hands off to Supabase for session minting) is **explicitly not decided by this ADR** — see Unresolved Questions in the final report.

## Supersession Impact Analysis (required by `docs/adr/README.md` before acceptance)

- **Specification impact**: none — SDD Ch.4/Ch.17.2 describe the auth *user experience and required controls*, not who issues the underlying JWT; this ADR fills an implementation gap the SDD leaves open, the same way ADR-003 did. No SDD text is contradicted.
- **Documentation impact**: `docs/target-architecture.md`, `docs/architecture-requirements.md`, `docs/decision-log.md`, `docs/current-state.md`, `env.example` — all updated as part of this task; see final report §2.
- **Code impact**: none — no auth code exists yet in the scaffold (confirmed in Phase 4 verification below).
- **Database impact**: future schema (ADR-002's follow-on work) must add `auth_user_id` references; no impact on already-defined naming.
- **API impact**: raises, but does not resolve, the question of whether Fastify owns a `/auth/*` REST surface or whether some auth steps happen client-side via the Supabase SDK directly — flagged as unresolved.
- **Security impact**: net positive (see Security Implications above); one new operational requirement introduced (active session revocation on device removal).
- **Deployment impact**: none beyond env-var placeholders already anticipated in ADR-013/`env.example`.
- **Migration impact**: none — no data or running system exists to migrate.
- **Rollback impact**: fully rollback-able at this stage (no implementation exists yet); would become a material migration if reversed after schema/auth code exists.

## Affected SDD Sections

Ch.4 (Parent Authentication Module), Ch.10 (Parent Mobile Application — auth/trusted-device module), Ch.9 (Student Mobile Application — auth module), Ch.17.2 (Security Architecture: Authentication & Device Security). None are contradicted; all are implemented *through* this ADR's boundary rather than through ADR-006's original custom-JWT design.

## Affected ADRs

- **ADR-006** — superseded in part, as stated above. Its historical text is unmodified; only supersession metadata is added (see the corresponding update to that file).
- **ADR-002, ADR-003, ADR-005, ADR-007, ADR-009** — informed/contextualized, not superseded. No contradiction with any of their accepted decisions.

## Consequences

- Any future implementation task building auth must build against this boundary model, not ADR-006's original custom-JWT design.
- `docs/auth-database-security-model.md` is the detailed reference for schema/claims/RLS/Realtime/session-lifecycle implementation.
- A future proposal to return to fully custom auth, or to let Supabase Auth own business-authorization decisions (device trust, attestation, biometric freshness) directly, contradicts this ADR and requires its own superseding ADR with full impact analysis.

## Rejected Alternatives

- **Keep ADR-006's original custom-JWT design** — rejected per Rationale above: reimplements a solved problem, fights RLS/Realtime's native assumptions, carries an avoidable secret.
- **Let Supabase Auth also own business-authorization decisions (device trust, attestation)** — rejected: Supabase Auth has no native model for these DigiHostel-specific, safety-relevant controls; forcing them into Supabase Auth (e.g. via heavy custom Auth Hook logic) would concentrate business logic in a harder-to-test, harder-to-audit location than Fastify+Postgres.
