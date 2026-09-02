# Auth / Database Security Model

Defines how Supabase Auth (ADR-014), Fastify (ADR-005), PostgreSQL/RLS (ADR-002, ADR-006), and Supabase Realtime (ADR-009) fit together for DigiHostel. This is architecture/security design only — no tables, migrations, RLS SQL, Auth Hooks, or auth middleware are implemented here (Phase 4 of this task explicitly excludes implementation).

> **Source-verification caveat**: this document was required to be written from current official Supabase documentation. The web research tools in this environment were unavailable for the entire task that produced it (confirmed non-transient — see `docs/adr/ADR-014-supabase-auth.md`'s methodology note). Sections describing Supabase-specific mechanics (§13 custom Auth Hooks, §15 RLS with `auth.jwt()`, §18 Realtime private-channel authorization) are built on stable, foundational Supabase architecture, but are **not freshly verified** and are individually flagged below where the risk of drift is highest. Treat this document as a strong starting design, not a final spec — spot-check the flagged sections against current `supabase.com/docs` before writing any Auth Hook or RLS policy against it.

## Security Boundary

```text
Supabase Auth
    ↓
JWT
    ↓
Fastify authentication        (is this JWT valid, current, not a revoked session?)
    ↓
Fastify business authorization (device trust? attestation? biometric freshness?
                                 — queried live from PostgreSQL, every request)
    ↓
PostgreSQL
    ↓
RLS as final database authorization boundary
```

**The client is never trusted merely because it possesses a valid JWT.** A valid JWT proves *who the caller claims to be* (an authenticated Supabase identity). It proves nothing about device trust, attestation status, or whether the specific operation being requested is currently permitted — those are re-checked against PostgreSQL on every sensitive request, not cached in or trusted from the token.

## Critical Rule (stated explicitly, applies throughout this document)

**Complex relationship data is never placed in JWT claims.** Specifically, none of the following may ever be JWT claims — they remain authoritative, queried-live PostgreSQL relationships, gated by RLS:

- parent → student
- guardian → student
- student → library session
- parent → approval request

Coarse, slow-changing, low-sensitivity data (a user's own row id, a coarse role label) may appear as claims where genuinely useful — see §13.

---

## 1. Supabase Auth Identity Model

Supabase Auth (GoTrue) manages the `auth.users` table in its own `auth` schema — one row per authenticated identity, holding credentials (phone/email/password hash, as applicable), confirmation status, and Supabase-internal metadata (`app_metadata`, `user_metadata`). DigiHostel has two identity populations that both need `auth.users` rows: **parents/guardians** (who authenticate) and **students** (who also authenticate, per SDD Ch.9). `auth.users` itself carries no DigiHostel-specific concept of role, roll number, or relationships — those live in application tables (§3).

## 2. `auth.users` Relationship to Application Users

Application tables (`parents`, `students`, per ADR-002's canonical vocabulary) each carry an `auth_user_id` column, a foreign key to `auth.users.id` (uuid). This is a **1:1 pointer**, not a relationship graph — it answers "which application profile does this authenticated identity correspond to," nothing more. The actual parent↔student, guardian↔student relationships live in their own join table(s) (naming to be finalized during schema implementation, per ADR-002's still-open structural questions), never inferred from or stored in `auth.users` or the JWT.

## 3. Application Profile/User Tables

`parents` and `students` (ADR-002) are the application-level profile tables, each linked 1:1 to an `auth.users` row via `auth_user_id`. Staff roles (Reception Warden, Library In-charge, Hostel Administrator, Super Administrator — SDD Ch.2 §2.2) need their own profile representation too; whether that's a unified `staff` table or role-specific tables is a schema-implementation decision, not decided here — flagged in Unresolved Questions.

## 4. Role Model

Coarse role (`student`, `parent`, `guardian`, `reception_warden`, `library_incharge`, `hostel_admin`, `super_admin` — SDD Ch.2 §2.2) is stored in a dedicated application table (e.g. a `role` column on the relevant profile table, or a `user_roles` join if a person can ever hold more than one role — not currently indicated by the SDD, but worth designing for). This coarse role is a legitimate JWT-claim candidate (§13) since it's low-sensitivity and slow-changing; specific *permissions* derived from role (e.g. Ch.7 §7.5's RBAC matrix) are evaluated server-side in Fastify/RLS, not baked into the claim itself.

## 5. Parent/Guardian/Student Relationships

Authoritative in PostgreSQL, per the Critical Rule. A join table (e.g. `parent_student_links`, naming subject to ADR-002's implementation-time resolution) maps `parents.id`/`students.id` pairs, with a type/role column distinguishing Parent from Guardian per the escalation chain (SDD Ch.5 §5.2). RLS policies join through this table to authorize access (§15) — this relationship is never embedded in a JWT claim.

## 6. Device-Trust Model

`trusted_devices` (ADR-002) stores one row per registered parent device, keyed to `parents.id` (not `auth.users.id` directly, to keep the domain model consistent with §2's 1:1-pointer pattern). Device trust is established and revoked entirely in PostgreSQL/Fastify — Supabase Auth has no native concept of it. **Device removal must trigger active Supabase session revocation** (via Supabase Auth's admin session-invalidation capability, called by Fastify with the service-role key), not just a `trusted_devices` row deletion — per SDD Ch.4 §4.3–§4.4 ("device removal revokes sessions") and ADR-014's security-implications note. Relying on passive access-token expiry alone leaves a residual-risk window (up to the access token's remaining lifetime) where a removed device's session could still authenticate.

## 7. Biometric Verification Boundary

Biometric verification happens entirely on-device (OS biometric API — e.g. `expo-local-authentication`, per ADR-004/ADR-008's mobile stack) and is **never transmitted to the backend**. What Fastify receives is a short-lived, action-bound assertion ("biometric confirmed for this specific approval/checkpoint action, at this timestamp") which it treats as one input to a business-authorization decision (§16) — it is not a JWT claim, not stored as a standing session property, and must be freshly supplied per sensitive action (SDD Ch.5 §5.2, Ch.6 §6.2 both require biometric confirmation immediately before the specific action, not once per session).

## 8. Platform-Attestation Boundary

Play Integrity (Android) / App Attest or DeviceCheck (iOS) results (ADR-003) are verified server-side by Fastify at trusted-device-registration time, and — per ADR-003's Consequences — should be re-checked at sensitive-operation time too, since device integrity can change within a session's lifetime. Like biometric confirmation, attestation status is a business-authorization input Fastify checks live, not a JWT claim.

## 9. Session Lifecycle

Owned by Supabase Auth (ADR-014). A session begins when the mobile app's Supabase client SDK completes sign-in (the mechanism for *which* sign-in method — see Unresolved Questions). The SDK manages the session object (access token + refresh token + expiry) and auto-refreshes it in the background. Sessions end via explicit sign-out (client-initiated), admin-triggered revocation (Fastify-initiated, e.g. on device removal, §6), or natural refresh-token expiry/invalidation.

## 10. Access-Token Lifecycle

Short-lived (Supabase's default is on the order of one hour — **flagged as a config-dependent value to confirm against the actual Supabase project settings, not hardcoded here**). Presented as a Bearer JWT on every Fastify request; verified per §16. Not independently revocable mid-lifetime by Fastify — this is the source of the residual-risk window noted in §6, and is exactly why sensitive-operation checks must re-verify live PostgreSQL state (device trust, attestation) rather than trusting the token's mere validity.

## 11. Refresh-Token Lifecycle

Long-lived, single-use, rotating: each use of a refresh token invalidates it and issues a new one, and reuse of an already-rotated refresh token is treated by Supabase Auth as a signal of possible theft (triggering session invalidation) — this is standard Supabase Auth behavior. **Flagged for spot-check**: exact reuse-detection behavior and configinstitution should be confirmed against current Supabase docs before relying on it as a security control in implementation.

## 12. Token Revocation

Two paths: (a) client-initiated sign-out, immediate; (b) Fastify/admin-initiated revocation via the Supabase Auth admin API (service-role privileged), used for device-removal-triggered revocation (§6) and any future incident-response need (e.g. SDD Ch.2 FR-012's security escalation could plausibly warrant forcing re-authentication). Revocation invalidates the refresh token; any already-issued access token remains valid until natural expiry (§10's residual window).

## 13. JWT Claims

Default Supabase claims (`sub`=`auth.users.id`, `aud`, `exp`, `role` in the Postgres-role sense, etc.) apply as normal. DigiHostel-specific custom claims are limited to:

- **coarse application role** (§4) — e.g. `app_role: "parent"` — low-sensitivity, slow-changing, genuinely useful for RLS policy short-circuiting and Fastify RBAC routing.
- **own profile id** — e.g. `parent_id` / `student_id`, a direct pointer to the caller's own row (not anyone else's, not a relationship) — a narrow convenience claim, not a relationship claim.

**Explicitly excluded from claims, per the Critical Rule**: which students a parent/guardian is linked to, which approvals are pending for them, which library session a student currently has open, device-trust status, or attestation status. All of these are queried live from PostgreSQL, scoped by `auth.uid()` in RLS policies or by Fastify's own authenticated-identity lookups — never trusted from the token.

## 14. Custom Auth Hook Requirements

A **Customize Access Token (JWT) Claims** Auth Hook (a Postgres function or HTTP endpoint Supabase Auth calls at token issuance/refresh time) is needed to inject the two narrow claims from §13 into the token. **Flagged for spot-check**: the exact current Supabase mechanism/configuration surface for this hook (hook types available, how they're registered against a project) should be confirmed against current `supabase.com/docs/guides/auth/auth-hooks` before implementation — this document asserts the hook's *purpose and scope* (inject two narrow, non-relational claims) with confidence, but not its exact current configuration steps.

## 15. RLS Authorization Model

RLS policies use `auth.uid()` (the JWT's `sub`) and, where useful, `auth.jwt()` for the coarse role claim (§13). Representative patterns (illustrative, not final SQL — schema implementation is a separate future task):

- `parents`/`students`: a row's owner (`auth_user_id = auth.uid()`) can `SELECT`/`UPDATE` their own profile.
- `leave_requests`: a parent/guardian can `SELECT` (and, for the approval action, `UPDATE`) rows where `EXISTS (SELECT 1 FROM parent_student_links WHERE parent_id = <caller's parents.id> AND student_id = leave_requests.student_id)` — the relationship is evaluated live via the join table (§5), never via a claim.
- `library_passes`/`journey_events`: a student can `SELECT` their own; Reception/Library-role callers (via the coarse role claim, §13, further narrowed by an actual staff-assignment table where relevant) can `SELECT` operationally-scoped sets.
- **Service-role connection (Fastify's privileged path, ADR-006) bypasses RLS entirely** for backend business-logic writes — RLS is the last-line defense for any direct client-to-Postgres/Realtime path, not the primary authorization mechanism for backend-mediated writes. This is unchanged from ADR-006's original (non-superseded) reasoning.

## 16. Fastify Authorization Model

Two layers, per the Security Boundary diagram: (1) **authentication** — verify the Supabase JWT is well-formed, signed correctly, and not expired (using Supabase's JWT secret/JWKS — **flagged for spot-check**: whether current Supabase projects use a shared HS256 secret or asymmetric JWKS-based verification by default affects exactly how Fastify validates tokens, and should be confirmed against the current project's Auth settings, not assumed); (2) **business authorization** — for any sensitive operation (approval, checkpoint scan, device management), query live PostgreSQL state for device trust (§6), require a fresh attestation/biometric assertion where applicable (§7, §8), and enforce RBAC (SDD Ch.7 §7.5, clarified by ADR-003's context that Warden roles never gain parent approval authority). Fastify never trusts client-supplied role or ownership claims beyond the coarse, narrow JWT claims defined in §13 — everything else is re-derived from PostgreSQL per request.

## 17. Privileged Server Operations

Fastify holds the Supabase `service_role` key (ADR-006) for: all business-logic writes (leave/approval/library/QR state transitions), Supabase Auth admin operations (session revocation on device removal, §6/§12; potentially user creation if the sign-up flow is backend-mediated — see Unresolved Questions), and any operation that must bypass RLS by design (audit-log writes on behalf of the system, background-job-driven state transitions via pg-boss, ADR-011). The service-role key is a maximally privileged secret and must never reach any client — this is unchanged from, and reinforced by, ADR-006's original secrets-handling stance.

## 18. Realtime Authorization

Supabase Realtime's **Postgres Changes** feed inherits RLS automatically — a client subscribed to e.g. `leave_requests` only receives change events for rows their own RLS-evaluated identity could `SELECT`. No separate configuration is needed beyond correct RLS policies (§15). For **Broadcast** channels (ADR-009's transient escalation alerts), Supabase's Realtime Authorization model gates channel access via RLS-style policies on a `realtime.messages` table for "private" channels — **flagged for spot-check**: the exact current mechanism (channel-naming conventions, policy shape) should be confirmed against current Supabase Realtime docs before implementation; this document asserts the *existence and purpose* of this control with confidence (private, RLS-gated broadcast channels, not open-to-anyone-who-knows-the-channel-name), not its exact current API surface. Both paths authenticate using the client's own Supabase session (ADR-014) — never a shared/service-role credential from a mobile client.

## 19. Offline-Session Security

Per ADR-008's offline architecture: the mobile client persists its Supabase session (access + refresh tokens) via `expo-secure-store` (native keychain/keystore-backed), not plain unencrypted storage, consistent with SDD Ch.9/Ch.10's "encrypted local storage" requirement. Queued offline actions (ADR-008) replay using the cached session on reconnect; if the cached session has actually expired or been revoked while offline (e.g. a device-removal revocation happened server-side during the offline window, §6), replay must fail gracefully and force re-authentication — it must never silently retry with a stale, no-longer-valid credential in a way that could mask a revoked-device attempting replay.

## 20. Audit Requirements

Every security-relevant event — sign-in, sign-out, session revocation, device registration/removal, attestation failures, approval decisions, checkpoint scans — is written to the domain-level `audit_logs` table (ADR-002) by Fastify, explicitly, as part of the business-authorization flow (§16) — this is the audit trail the SDD (Ch.12: "All modules → Audit Logs") and this project's governance (`.claude/rules/security.md`) require. Supabase Auth also maintains its own internal, lower-level audit table (`auth.audit_log_entries`) — this is a secondary, GoTrue-internal record, not a substitute for the domain-level `audit_logs` requirement, and should not be relied upon as the primary audit source for DigiHostel-specific security events.
