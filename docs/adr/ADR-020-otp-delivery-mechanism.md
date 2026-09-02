# ADR-020: OTP Delivery/Verification Mechanism (Parent Authentication)

- **ADR ID:** ADR-020
- **Title:** OTP Delivery/Verification Mechanism for Parent Authentication
- **Status:** ACCEPTED (mechanism only — see "Open Question, Not Resolved Here" for the one sub-item this ADR deliberately does not decide)
- **Date:** 2026-09-03
- **Related ADRs:** ADR-014 (Supabase Auth as Canonical Identity/Authentication Provider) — this ADR **completes**, rather than supersedes, ADR-014's explicitly stated open question ("The question of *how* the OTP step itself is delivered... is explicitly not decided by this ADR"), the same pattern ADR-016 used to complete an ADR-002 deferred question. ADR-003 (Parent Device Verification Scope) — this ADR's OTP step is the flow stage that precedes ADR-003's platform-attestation gate. ADR-004 (Mobile Technology).

## Context

SDD Ch.4 §4.2 specifies the parent registration flow as: Enter Student Roll Number → validate linked parent record → **Verify OTP** → register trusted device → enable biometrics → dashboard access. Prompt 0.6's audit (G-19) flagged that no accepted ADR or implementation decides *how* that OTP step is actually delivered and verified — ADR-014 canonicalized Supabase Auth for identity/session issuance but explicitly left the OTP delivery/verification mechanism itself as an open question, since OTP could plausibly be implemented either as Supabase Auth's own native phone-OTP flow, or as a fully custom Fastify-owned OTP flow that only hands off to Supabase for session minting afterward.

This decision was blocking further design of the Parent app's Login/OTP screen and is resolved here per Prompt 0.7's explicit instruction to record an architectural decision rather than leave the gap silently unresolved or invent a provider-specific implementation prematurely.

## Decision

**Supabase Auth's native phone-based OTP flow** (`signInWithOtp({ phone })` to trigger delivery, `verifyOtp({ phone, token, type: "sms" })` to verify and mint the session) is the OTP delivery and verification mechanism for parent authentication. Fastify does **not** generate, store, hash, rate-limit, or verify OTP codes itself.

Sequencing, consistent with SDD Ch.4 §4.2 and ADR-003's already-accepted flow amendment: **Roll Number → validate a matching `parents` record exists (server-side, against the roll-number-linked student's `parent_student_relationships`) → trigger Supabase's phone OTP for that record's `phone_number` → verify OTP (client, via the Supabase SDK) → Supabase issues the session → platform attestation (ADR-003) → trusted device registration → biometric enrollment → dashboard.** The roll-number-to-parent-record validation step must happen **before** an OTP is ever triggered, so a phone-OTP SMS is only ever sent to a number already on file as a registered parent's `phone_number` — never to an arbitrary caller-supplied number. The exact mechanics of that pre-check gate (a dedicated lightweight Fastify endpoint vs. some other approach) are **not decided by this ADR** — that is Parent-app auth-flow implementation detail, out of this ADR's scope, to be resolved when that flow is actually built.

## Options Considered

### Option A — Supabase Auth's native phone-OTP flow (selected)

Supabase Auth generates, delivers (via its configured SMS provider), and verifies the OTP itself; a successful verification directly issues a Supabase session.

- **Pros:** Zero new secret-handling surface for Fastify (no OTP code storage, hashing, expiry, or rate-limiting logic to build and security-review) — Supabase Auth already implements all of this, and the local dev config (`supabase/config.toml`'s `[auth.rate_limit]`: `sms_sent = 2/hour`, `token_verifications = 30/5min/IP`) already demonstrates working rate-limiting infrastructure for exactly this flow. Directly consistent with ADR-014's boundary model — OTP delivery/verification is squarely an *identity-issuance* concern (Supabase Auth's domain), not a *business-authorization* gate like device trust/attestation/biometric freshness (Fastify's domain) — it does not blur that boundary the way a custom OTP flow calling into Supabase afterward would. No new vendor integration beyond what Supabase Auth already requires for production SMS delivery (see Open Question below).
- **Cons:** Ties OTP delivery timing/format/retry behavior to Supabase Auth's own phone-OTP implementation, which offers less bespoke control than a fully custom flow (e.g., custom SMS copy/branding is more limited).

### Option B — Fully custom Fastify-owned OTP flow (generate/store/rate-limit/verify OTP codes in Fastify+Postgres, hand off to Supabase only to mint the session afterward)

- **Pros:** Full control over OTP code format, delivery provider choice per-message, custom retry/lockout policy independent of Supabase Auth's own settings.
- **Cons:** Reimplements a solved problem — exactly the class of "why is Fastify reinventing something Supabase Auth already does correctly" reasoning ADR-014 already used to reject a fully custom JWT/session system. Introduces a new secret-handling surface (OTP codes are short-lived secrets requiring secure generation, hashing-at-rest, expiry, and rate-limiting — all new code to build, test, and security-review) for no capability this system's requirements actually need. Requires Fastify to still hand off to Supabase Auth afterward to mint the actual session (since ADR-014 remains in force), meaning this option pays the full cost of a custom OTP system while still needing Supabase Auth integration anyway — strictly more work for no net capability gain.

### Option C — Defer the decision, let the Parent-app implementation phase decide ad hoc

- **Pros:** Avoids committing now.
- **Cons:** Directly contradicts Prompt 0.7's instruction not to leave this as a silent gap when it can be confidently decided from existing accepted architecture (ADR-014 already establishes the relevant boundary; this decision follows directly from it without inventing new capability).

## Rationale

1. ADR-014's boundary model already draws the line this decision needs: Supabase Auth owns "session/token substrate" concerns; Fastify owns "business-authorization gates layered on top of a valid session" (device trust, attestation, biometric freshness). OTP is unambiguously the former — it is *how the session gets issued in the first place*, not a gate on an already-issued session.
2. No SDD text or accepted ADR requires OTP-specific behavior (custom retry copy, non-SMS delivery channels, etc.) that Supabase's native phone-OTP flow cannot provide — SDD Ch.4 §4.2 only says "Verify OTP," with no implementation detail favoring a custom build.
3. This keeps the OTP secret-handling surface entirely inside Supabase Auth, which is already the accepted, audited identity provider — avoiding a second, bespoke place in this system where short-lived authentication secrets are generated, stored, and rate-limited.
4. Smallest-architecture principle (per this task's explicit instruction to "prefer the smallest architecture consistent with the existing Supabase Auth decision"): Option A requires zero new Fastify code for the OTP mechanism itself, only the roll-number-to-parent-record pre-check gate that SDD Ch.4 §4.2's own sequencing already requires regardless of which OTP option was chosen.

## Consequences

- The Parent (and Student, where applicable) mobile app's Login/OTP screen is built against the Supabase client SDK's `signInWithOtp`/`verifyOtp` calls, not a custom Fastify `/auth/verify-otp`-style endpoint (SDD Ch.4 §4.7's illustrative endpoint sketch, `POST /auth/verify-otp`, is superseded by this ADR for implementation purposes — the SDD text itself is not modified, per `docs/implementation-baseline.md`'s source-of-truth hierarchy).
- A new, small Fastify endpoint (or equivalent mechanism) is still required for the roll-number-to-parent-record pre-check gate that must run *before* the OTP is triggered — this is genuinely new work, but it is a business-authorization pre-check (Fastify's domain), not an OTP-mechanism concern, and is correctly out of this ADR's scope.
- `docs/current-state.md` should be updated to reflect that the OTP mechanism decision is now resolved (ACCEPTED), while the SMS-provider selection sub-question (below) remains explicitly open.
- Any future proposal to build a custom Fastify-owned OTP generation/verification system contradicts this ADR and requires a superseding ADR with full impact analysis.

## Open Question, Not Resolved Here — Production SMS Provider Selection

Supabase Auth's phone-OTP flow requires a configured upstream SMS provider (e.g. Twilio, MessageBird, Vonage, or an India-specific aggregator such as MSG91/Textlocal, given this system's KIIT/India deployment context) to actually deliver SMS in a non-local environment — local development already works today via Supabase's local Inbucket/test-OTP tooling (`supabase/config.toml`), which requires no such provider. **Which provider to use in production, and who bears its per-message cost, is a procurement/budget decision this ADR does not make** — it is explicitly out of scope, per this task's instruction not to invent a decision that genuinely requires product-owner/business input. This does not block further implementation: the mobile app and Fastify's pre-check gate can be built and tested end-to-end against Supabase's local phone-OTP tooling today, with the production SMS provider substituted later via Supabase project configuration alone (no application-code change required, since the app only ever calls Supabase's SDK methods, never a provider-specific API directly). **Recorded as a required pre-production decision, not a pre-development blocker.**

## Rejected Alternatives

- **Option B (fully custom OTP flow)** — rejected: reimplements a solved problem Supabase Auth already provides, adds a new secret-handling surface with no corresponding capability gain, and contradicts ADR-014's already-accepted boundary model.
- **Option C (defer)** — rejected: the decision follows directly from already-accepted architecture (ADR-014) and does not require inventing new capability; deferring it would leave the Parent app's Login screen unable to be designed for no good reason.

## Impact on Future Implementation

- Parent (and Student) mobile-app authentication implementation must use the Supabase client SDK's phone-OTP methods directly, per ADR-014's existing "mobile clients use the Supabase client SDK for session management" boundary.
- A small Fastify pre-check endpoint (roll-number → matching parent-record validation, triggered before the client calls `signInWithOtp`) remains a genuine, not-yet-built implementation item — flagged for the Parent-app auth-flow implementation task, not invented here.
- Production SMS-provider selection remains a required, explicitly-tracked open decision — must be resolved before a production release, not before further development.
- This ADR does not modify SDD Ch.4; Ch.4 §4.2's OTP step and §4.7's illustrative endpoint list remain as written. This ADR is the authoritative implementation-level resolution of the mechanism question, per `docs/implementation-baseline.md`'s source-of-truth hierarchy.
