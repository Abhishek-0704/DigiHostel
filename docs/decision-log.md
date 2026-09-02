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

## ADR-020 — OTP Delivery/Verification Mechanism for Parent Authentication

Date: 2026-09-03
Status: ACCEPTED (mechanism only — SMS-provider selection explicitly left open)

Context: ADR-014 canonicalized Supabase Auth for identity/session issuance but explicitly left open *how* the OTP step in the parent registration flow (SDD Ch.4 §4.2) is delivered/verified — Supabase's own native phone-OTP flow, or a fully custom Fastify-owned OTP system. Flagged as G-19 in the Prompt 0.6 backend audit as a blocker for designing the Parent app's Login/OTP screen.

Decision: Supabase Auth's native phone-OTP flow (`signInWithOtp`/`verifyOtp`) is the OTP mechanism. Fastify never generates, stores, or verifies OTP codes itself. A roll-number-to-parent-record pre-check (new, small, not yet built) must run before the OTP is triggered, so SMS is only ever sent to an already-registered parent's phone number.

Alternatives considered: a fully custom Fastify-owned OTP system (rejected — reimplements a solved problem Supabase Auth already provides, adds a new secret-handling surface for no capability gain); deferring the decision (rejected — it follows directly from already-accepted architecture).

Consequences: the Parent/Student mobile apps' Login/OTP screens are built against the Supabase client SDK directly, not a custom Fastify OTP endpoint; a new Fastify pre-check endpoint is still required (business-authorization concern, not an OTP-mechanism one). Production SMS-provider selection (Twilio/MessageBird/Vonage/an India-specific aggregator) and its cost remain an explicitly open, tracked pre-production decision — not a pre-development blocker, since local Supabase tooling already supports building/testing the flow end-to-end without one.

Verification/evidence: see `docs/adr/ADR-020-otp-delivery-mechanism.md` for the full options analysis and the explicitly-flagged open question.

---

Initial known decisions:
- Use pnpm as the workspace package manager.
- Keep Supabase architecture.
- Use `@supabase/supabase-js` in `@workspace/api-server`.
- Keep Zod 3.25.76 and configure Orval for Zod 3 output.
- Treat the API/OpenAPI contract as shared infrastructure.
- Preserve a modular-monolith architecture initially.
