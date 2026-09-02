# Architectural Decision Log

Record only meaningful project-level decisions.

Template:

## ADR-XXX — Title

Date:
Status:

Context:
Decision:

Alternatives considered:

Consequences:

Verification/evidence:

---

## ADR-014 — Supabase Auth as Canonical Identity/Authentication Provider

Date: 2026-09-02
Status: ACCEPTED (supersedes ADR-006's auth-strategy clause only; see `docs/adr/ADR-014-supabase-auth.md`)

Context: ADR-006 originally rejected Supabase Auth in favor of a fully custom Fastify-issued JWT, on the basis that DigiHostel's bespoke OTP/device-trust/biometric/attestation flow didn't map onto Supabase Auth's standard flows. That evaluation treated Supabase Auth as an all-or-nothing replacement rather than as the session/token substrate underneath a still-fully-custom authorization layer.

Decision: Supabase Auth owns identity (`auth.users`) and session/JWT/refresh-token lifecycle. The bespoke OTP/device-trust/biometric/attestation controls remain fully required, re-scoped as Fastify/Postgres-enforced business-authorization gates on top of a valid Supabase session.

Alternatives considered: keep the original custom-JWT design (rejected — reimplements a solved problem, fights RLS/Realtime's native assumptions); let Supabase Auth also own business-authorization decisions like device trust (rejected — no native model for these DigiHostel-specific controls).

Consequences: removes a bespoke JWT-signing secret; RLS/Realtime authorization become native rather than hand-compatible; introduces a new operational requirement (active Supabase session revocation on device removal, not passive expiry).

Verification/evidence: see `docs/adr/ADR-014-supabase-auth.md`'s full supersession impact analysis and `docs/auth-database-security-model.md` for the detailed security model.

---

Initial known decisions:
- Use pnpm as the workspace package manager.
- Keep Supabase architecture.
- Use `@supabase/supabase-js` in `@workspace/api-server`.
- Keep Zod 3.25.76 and configure Orval for Zod 3 output.
- Treat the API/OpenAPI contract as shared infrastructure.
- Preserve a modular-monolith architecture initially.
