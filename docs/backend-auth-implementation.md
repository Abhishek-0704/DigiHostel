# Backend Authentication/Authorization Implementation

Implements the boundary designed in `docs/auth-database-security-model.md` (ADR-014, ADR-003, ADR-002, ADR-015): `apps/api/src/lib/auth/*`, `apps/api/src/plugins/auth.ts`. This document describes what actually exists in code — for the design rationale, see the security model doc; this file does not repeat it.

## Authentication Flow

1. Client sends `Authorization: Bearer <Supabase-issued JWT>` on a request to a protected route.
2. `app.authenticate` (the base preHandler, `lib/auth/guards.ts`'s `createAuthenticate`) runs first:
   - Extracts the token (`lib/auth/jwt.ts`'s `extractBearerToken`) — missing/malformed header → 401.
   - Verifies the JWT (`JwtVerifier.verify`) against Supabase's JWKS — invalid signature/expired/wrong issuer/wrong audience → 401.
   - Resolves the verified `sub` to a DigiHostel app profile (`lib/auth/profile.ts`'s `resolveAppProfile`) — valid session but no matching `students`/`parents`/`staff` row → 401 (`no_app_profile`, deliberately distinct from the "no token at all" 401).
   - On success, populates `request.auth = { userId, claims, profile }`.
3. Route-specific guards (also `lib/auth/guards.ts`) run after `app.authenticate`, checking role/relationship/scope/device-trust against live PostgreSQL state — never against JWT claims beyond the coarse identity `authenticate` already resolved. Failure → 403.

## JWT Verification Boundary (`lib/auth/jwt.ts`)

- Verifies against the project's live JWKS endpoint (`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`) using `jose`'s `createRemoteJWKSet` + `jwtVerify` — no manual cryptography.
- Confirmed empirically against a real local Supabase instance (`supabase start`): it publishes an `ES256` asymmetric key, `iss` = `${SUPABASE_URL}/auth/v1`, `aud` = `authenticated`. The verifier allow-lists `["ES256", "RS256"]` rather than assuming one algorithm.
- Does **not** support the legacy shared-HS256-secret model — this backend targets the current JWKS-based signing-key model, per this task's requirement. A project still on the legacy model would need a different configuration path (not built here — flagged as a follow-up).
- JWKS caching uses `jose`'s own defaults (a max-age cache plus a cooldown between re-fetches on an unrecognized `kid`), not reimplemented.
- Fails securely: `createJwtVerifier`/`registerAuth` throw at construction/startup if `SUPABASE_URL` is missing — a misconfigured deployment refuses to start rather than silently accepting anything.
- Errors never leak token contents; `mapJoseError` maps every `jose` error to one of a small set of stable codes (`missing_token`, `malformed_token`, `invalid_signature`, `expired`, `invalid_issuer`, `invalid_audience`, `verification_failed`), logged server-side by code only, returned to the client as a generic `{ error: { code, message } }` — the raw JWT is never logged or echoed back.

## Fastify Authorization Boundary (`lib/auth/guards.ts`, `plugins/auth.ts`)

Two layers, always composed in this order on a protected route: `app.authenticate` (identity), then one or more of:
- `requireStudent()`, `requireParentOrGuardian()`, `requireStaffRole(...roles)` (and the `requireReception`/`requireLibraryIncharge`/`requireHostelAdmin`/`requireSuperAdmin` convenience wrappers) — **role** checks.
- `requireLinkedToStudent(dbPort, getStudentId)` — **relationship** check (queries `parent_student_relationships` live); explicitly does not treat "is a parent" as sufficient for "is linked to *this* student."
- `requireStaffScopeForStudentHostel(getStudentHostelId)` — **scope** check (reception/hostel_admin are hostel-scoped; library_incharge/super_admin are not).
- `requireActiveTrustedDevice(dbPort)` — **device-trust** check (a parent whose every device is revoked is denied even with a valid session — the residual-access-token-window defense ADR-014 flags).

Every one of these guards re-derives its answer from `AuthDbPort` (live PostgreSQL) on every request — none trust a JWT claim, a mobile-supplied role header, or cached state.

## Supabase Auth → App Profile Mapping (`lib/auth/profile.ts`, `lib/auth/db-port.ts`)

`resolveAppProfile` checks `students.auth_user_id` → `parents.auth_user_id` → `staff.auth_user_id` (in that order) for a match, using the existing foreign keys — no new identity table. `AuthDbPort` is a narrow interface (five methods, each mirroring one relationship the RLS matrix also enforces); `DrizzleAuthDbPort` is the real, `@digihostel/db`-backed implementation. Every guard/test uses this same interface, backed in tests by an in-memory `FakeAuthDbPort` fixture.

## Relationship Authorization

Parent/guardian ↔ student and staff ↔ hostel remain 100% PostgreSQL-authoritative (`parent_student_relationships`, `staff.hostel_id`) — this is Fastify-side, defense-in-depth enforcement of the *same* relationships `docs/rls-policy-matrix.md`'s RLS policies independently enforce at the database layer. If a bug ever let a Fastify guard through incorrectly, RLS remains the final backstop (confirmed working and tested in the prior database-foundation task) — this task did not change any RLS policy or database schema.

## Future Device/Attestation/Biometric Gates (`lib/auth/security-gates.ts`)

`DeviceAttestationGate` and `BiometricFreshnessGate` are typed interfaces only. The only production-registered implementations, `NotImplementedAttestationGate`/`NotImplementedBiometricFreshnessGate`, throw rather than silently succeeding — no route in this task calls them, and no code claims production attestation/biometric verification exists. `requireActiveTrustedDevice` (device-trust **validation** — is this device currently marked trusted, per real `trusted_devices.revoked_at` data) is real today and distinct from device **attestation** (cryptographic proof of device/app integrity, e.g. Play Integrity), which remains unimplemented. Future work wires a real provider behind these interfaces without changing route authorization structure.

## Configuration / Environment Variables

- `SUPABASE_URL` (required) — used to derive both the JWKS endpoint and the expected `iss` claim. Already present in `env.example`; no new variables were required for this task.
- `DATABASE_URL` — used by `@digihostel/db`'s `postgres()` connection (unchanged by this task).

No new secrets were introduced. No credentials were requested, created, pasted, or committed.

## Local Testing Approach

All required tests (`apps/api/src/lib/auth/jwt.test.ts`, `guards.test.ts`, `apps/api/src/routes/test-auth.test.ts`, plus the pre-existing `health.test.ts`) run fully offline and deterministically:
- JWT tests use `jose`'s `generateKeyPair("ES256")` to create a real, in-process test keypair and sign real tokens with it — genuine cryptographic verification, zero network calls, zero dependency on any Supabase project (local or remote).
- Guard/profile tests use `FakeAuthDbPort` (`lib/auth/__fixtures__/fake-db-port.ts`), an in-memory fixture — no live database connection.
- `test-auth.test.ts` exercises the real Fastify app (`buildApp()`) end-to-end via `app.inject()`, with the JWT verifier and DB port injected as the same fakes — proving the actual wiring (`app.ts` → `plugins/auth.ts` → `lib/auth/guards.ts`) works together, not just each unit in isolation.

The real local Supabase instance (`supabase start`, from the prior database-foundation task) was used only to empirically confirm the JWKS/issuer/claim shape this implementation targets (decoding one real signed-up test token) — not as a dependency of the automated test suite, consistent with this task's "must not depend on a remote Supabase project" requirement (and, more strictly than required, not on a *running* local one either — the suite is fully offline).
