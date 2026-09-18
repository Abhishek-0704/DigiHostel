# ADR-003 Implementation Report — Trusted Device Attestation and Secure Device Registration

**Date:** 2026-09-13
**Author:** Implementation task ("ADR-003 IMPLEMENTATION — Trusted Device Attestation and Secure Device Registration"), continuation of "TASK 8 CONTINUATION — Physical Device Trusted-Device Verification"
**Scope:** Android Play Integrity attestation, full server-controlled registration flow. iOS DeviceCheck/App Attest was evaluated and explicitly not built this pass (see §3, §21).

---

## 1. Final Classification

**BLOCKED BY PLATFORM/INFRASTRUCTURE DEPENDENCY.**

Not **IMPLEMENTED AND VERIFIED**, and not a silent "PARTIAL IMPLEMENTATION" left ambiguous. The distinction, stated precisely:

- The full server-controlled attestation **architecture** is real, production-intent code — not a stub, not a mock left in the production path, not a `isTrusted=true` shortcut. It is built, unit-tested, integration-tested against a real local Postgres instance, and passes the full workspace verification pipeline (§14).
- It has **never been exercised end-to-end against Google's live Play Integrity servers or on a physical device**, because doing so requires a Google Play Console project and a linked Google Cloud project number — a real, external, paid ($25 one-time), account-holder-owned dependency. The user was asked directly whether this could be set up and answered: *"No, and I don't want to set this up right now."*
- Per that explicit instruction, this report does not claim IMPLEMENTED AND VERIFIED, does not fabricate a physical-device PASS, and does not weaken this classification to make the task look more complete than it is.

## 2. Baseline Before This Task

Independently reconfirmed on real physical hardware (Task 8 Continuation, same session, before implementation began — see that task's own report): a Vivo V2253 running Android 15 reached the "Verify this device" screen twice, both times showing "Device verification isn't available yet. Please try again later." — no native Play Integrity UI ever appeared. Source inspection confirmed why: `registerCurrentDevice()` unconditionally threw, the backend's `NotImplementedAttestationGate` unconditionally threw, no Fastify route existed for device registration, and `trusted_devices` had already had its unsafe self-service INSERT policy removed (F-01 remediation) with no replacement path. Classification at that point: **PARTIAL PASS — DOCUMENTED IMPLEMENTATION GAP**.

## 3. Platform Strategy Decision

Android-only for this pass. Android's Play Integrity API is mature, has no known cross-platform feasibility blocker (per ADR-003's own original Rationale §2), and does not require Apple hardware to build or test. iOS App Attest/DeviceCheck requires a paid Apple Developer account, Apple hardware for any real verification, and was out of reach in this Windows-only development environment (the same constraint recorded in Finding F-09's native-verification work). `registerCurrentDevice()` remains fail-closed (`DeviceServiceNotImplementedError`) on iOS — unchanged, not silently left ambiguous.

## 4. Architecture Overview

```
Parent app (Android)                     Fastify backend                      Google Play Integrity
──────────────────────                   ────────────────                     ──────────────────────
registerCurrentDevice()
  │
  ├─ POST /devices/challenge ──────────▶ DeviceRegistrationService
  │                                        .createChallenge()
  │                                          → ChallengeRepository.create()
  │                                            (32-byte CSPRNG nonce,
  │                                             5 min TTL, stored server-side
  │                                             only — zero client RLS access)
  │◀──────────────────────────────────── { challengeId, nonce, expiresAt }
  │
  ├─ native call: IntegrityManagerFactory
  │   .requestIntegrityToken(nonce, cloudProjectNumber) ─────────────────────▶ Google servers
  │◀──────────────────────────────────────────────────────────────────────── signed integrity token
  │
  ├─ POST /devices/register ───────────▶ DeviceRegistrationService
  │   { challengeId, attestationToken,      .registerDevice()
  │     deviceFingerprint }                   → ChallengeRepository.consume()
  │                                              (atomic, single-use,
  │                                               UPDATE...WHERE consumedAt
  │                                               IS NULL AND expiresAt>now())
  │                                            → AttestationVerifier.verify()
  │                                              → PlayIntegrityVerifier:
  │                                                decodes token via Google's
  │                                                REST API (service-account
  │                                                OAuth), checks nonce match,
  │                                                package match, request
  │                                                freshness, device-integrity
  │                                                verdict
  │                                            → TrustedDeviceRepository
  │                                              .createTrustedDevice()
  │                                              (creates trusted_devices row
  │                                               ONLY on a real PASS verdict)
  │◀──────────────────────────────────── { id, platform, registeredAt }
```

The client never learns or influences the nonce's value beyond receiving it; the backend never trusts a client-declared attestation result; `trusted_devices` is written to by exactly one code path, gated entirely behind a real verified PASS.

## 5. Server-Controlled Challenge/Nonce Design

- `device_registration_challenges` (new table, `packages/db/src/schema/device.ts`): `id`, `parentId`, `platform`, `nonce`, `createdAt`, `expiresAt`, `consumedAt`.
- **Single-use**: `ChallengeRepository.consume()` performs an atomic `UPDATE ... WHERE id = ? AND parentId = ? AND consumedAt IS NULL AND expiresAt > now() RETURNING *`. A second consumption attempt with the same challenge affects zero rows and is treated as `challenge_already_consumed` — verified by `service.test.ts`'s replay test and `challengeRepository.integration.test.ts` against real Postgres.
- **Short-lived**: 5 minutes by default, overridable via `DEVICE_CHALLENGE_TTL_MS` (`apps/api/src/config/deviceAttestation.ts`) — never hard-coded, per `.claude/rules/coding.md`.
- **Server-controlled**: the nonce is 32 bytes from Node's CSPRNG (`crypto.randomBytes`), generated only by the backend. The client cannot choose, predict, or influence it.
- **Zero client-facing RLS access**: `device_registration_challenges` carries no `pgPolicy` entries at all (matches `audit_logs`'s existing zero-policy pattern) — the client's Supabase session can never SELECT, INSERT, or UPDATE this table directly; the nonce is learned only via the HTTP response body of `POST /devices/challenge`. Verified by 8 pgTAP assertions in `supabase/tests/database/15_adr003_device_registration_challenges_rls.sql` (attacker cannot SELECT/INSERT/UPDATE, cross-parent read denied, anonymous denied, legitimate privileged-connection path still works) — all passing.

## 6. Backend as Sole Trust Authority

The client can never self-declare trust. `registerCurrentDevice()`'s only client-side effect of a successful call is receiving back exactly what the backend already decided (`{id, platform, registeredAt}`) — it does not construct or infer a `TrustedDeviceSummary` from local state on any success path, and on every failure path it throws rather than substituting a locally-fabricated result. The mobile-side orchestration (`registerDeviceOrchestration.test.ts`, "never calls submitRegistration with a locally-fabricated device id/platform" test) explicitly asserts this. Server-side, `trusted_devices` has no INSERT policy for `authenticated` at all (F-01 remediation, unchanged by this task) — the only way a row is created is through `DrizzleTrustedDeviceRepository.createTrustedDevice()`, called only from `DeviceRegistrationService.registerDevice()`, called only after `AttestationVerifier.verify()` returns a `pass` verdict.

## 7. RLS Preservation

No existing RLS policy was weakened. The new table (`device_registration_challenges`) ships with zero policies (the most restrictive posture available). `trusted_devices` is unchanged — still no client INSERT path. `device_attestation_events`/`audit_logs` are unchanged. `supabase test db` re-run this task: **122/122 pgTAP assertions pass across 16 files**, including all 12 pre-existing suites and the 1 new suite for this table.

## 8. Device Identity

`deviceFingerprint` is the app's existing `deviceIdentityService.getInstallationId()` (Expo's application-instance identifier, already used by `listTrustedDevices()`'s `isCurrentDevice` comparison) — no new identity primitive was introduced. `trusted_devices_parent_fingerprint_key`'s existing unique index gives `createTrustedDevice()` its idempotent-retry behavior (a retried registration with the same fingerprint returns the existing active device rather than creating a duplicate).

## 9. Registration Flow (Client)

`orchestrateAndroidDeviceRegistration()` (`apps/parent-mobile/src/services/devices/registerDeviceOrchestration.ts`) — pure, dependency-injected, unit-tested in isolation from React Native:
1. Reads the configured Cloud Project number; throws `DeviceAttestationNotConfiguredError` immediately if absent (never attempts a native call it knows will fail).
2. Requests a challenge.
3. Makes the native Play Integrity call bound to that exact nonce.
4. Submits registration with the resulting token.

`devices.ts`'s `registerCurrentDevice()` wires this to the real native module, the real generated API client (`@digihostel/api-client-react`), and the real `deviceIdentityService` — translating `DeviceAttestationNotConfiguredError` into the same `DeviceServiceNotImplementedError` every existing caller (screens, hooks) already handles, so no UI code needed to change.

## 10. Failure Behavior (Fail-Closed)

Every failure mode propagates as a real error; none is swallowed or converted into a fabricated success:

| Failure | Client behavior | Backend behavior |
|---|---|---|
| No Cloud Project configured | Throws before any network/native call | N/A |
| Challenge request fails (network) | Propagates | N/A |
| Native Play Integrity call fails | Propagates, registration never submitted | N/A |
| Unknown/expired/already-consumed challenge | Propagates | `401`, reason `challenge_not_found`/`challenge_expired`/`challenge_already_consumed` |
| Attestation provider not configured (no server-side credentials) | Propagates | `503`, `attestation_provider_not_configured` |
| Nonce mismatch (replay attempt with a stale token) | Propagates | `401`, `attestation_rejected` |
| Package name mismatch | Propagates | `401`, `attestation_rejected` |
| Stale request (>2 min old per Google's own timestamp) | Propagates | `401`, `attestation_rejected` |
| Device integrity verdict not met | Propagates | `401`, `attestation_rejected` |
| Google API call itself errors | Propagates | `502`, `attestation_verification_error` |

Covered by 13 backend unit tests (`service.test.ts`), 8 attestation-verifier tests (`attestationVerifier.test.ts`), 5 real-Postgres challenge-repository tests, 4 real-Postgres trusted-device-repository tests (including the new AuthGate-integration test, §12), 7 route-level tests (`devices.test.ts`), and mobile-side: 6 orchestration tests + 17 `devices.test.ts` tests (13 in the ADR-003-specific `describe` block).

## 11. Replay and Cross-User Protection

- **Replay**: a consumed challenge cannot be consumed again (§5's atomic `UPDATE`) — proven by both a unit test (fake repository) and a real-Postgres integration test attempting a second `consume()` call on the same row.
- **Cross-user**: `consume()`'s `WHERE` clause includes `parentId = ?` — parent B cannot consume a challenge issued to parent A, proven by `service.test.ts`'s "wrong-user rejected" test. `trustedDeviceRepository.integration.test.ts`'s "cross-user isolation" test independently proves two different parents' registrations never interfere.
- **Nonce-binding**: `AttestationVerifier.evaluateVerdict()` rejects any token whose decoded `requestDetails.nonce` doesn't exactly match the challenge's stored nonce — this is the core defense against a token obtained for one challenge being replayed against another.

## 12. AuthGate Integration — Explicitly Re-Verified

The task required this not be assumed. `requireActiveTrustedDevice()`/`hasActiveTrustedDevice()` (`apps/api/src/lib/auth/guards.ts`, `db-port.ts`) were not modified by this task — they query `trusted_devices` directly for `parentId` match and `revokedAt IS NULL`. Since `createTrustedDevice()` inserts with `revokedAt` unset (null), a device created by the new ADR-003 flow is immediately recognized as trusted by the pre-existing, independent leave-decision gate. This was not left as an inference from reading two files side by side: a new integration test was added and passed against real Postgres —

```
apps/api/src/domain/device/trustedDeviceRepository.integration.test.ts
  "AuthGate integration: a device this repository just created is immediately
   recognized as trusted by the real, independent DrizzleAuthDbPort
   .hasActiveTrustedDevice() used to gate leave decisions" — PASS
```

which explicitly constructs a real `DrizzleAuthDbPort`, confirms `hasActiveTrustedDevice()` is `false` before registration and `true` immediately after, against a real database, with no mocking of either side of the seam.

## 13. Device Management (Revocation) — Explicitly Out of Scope, Not Silently Expanded

`revokeDevice()` remains unimplemented (`DeviceServiceNotImplementedError`), exactly as before this task. This was a deliberate non-goal: ADR-003 concerns the attestation gate on *registration*, not removal; building a real revocation endpoint was not requested and was not attempted. This is stated explicitly here so it is not mistaken for an oversight.

## 14. Full Verification Pipeline (Re-Run This Task)

| Check | Result |
|---|---|
| `pnpm run typecheck` (all 8 workspace packages) | Clean |
| `pnpm run lint` | Clean (one pre-existing vestigial `.eslintrc.js` scaffold artifact from `create-expo-module`, with no `package.json` and unused by this repo's flat ESLint config, was removed — the correct fix per this repo's "generated code" convention, not a lint-rule weakening) |
| `pnpm test` (no `DATABASE_URL`) | 633 passed, 54 skipped, 0 failed |
| `pnpm test` (with local `DATABASE_URL`, integration tests included) | 682 passed, 6 skipped, 0 failed |
| `pnpm run build` (incl. runtime-resolution verification) | Clean |
| `supabase test db` (pgTAP) | 122/122 assertions, 16/16 files, PASS |
| `npx expo-doctor` (parent-mobile) | 18/18 checks passed |
| `npx expo export --platform android` (parent-mobile) | Succeeded, zero errors |

No test was deleted, weakened, or skipped to reach these numbers. The 54/6 skipped counts are pre-existing `DATABASE_URL`-gated integration suites and one Supabase-instance-gated mobile integration suite, unchanged by this task.

## 15. Contract-First Compliance

`packages/api-spec/openapi.yaml` was updated first (`/devices/challenge`, `/devices/register`, `DevicePlatform`, `RequestDeviceChallengeBody`, `DeviceChallenge`, `RegisterDeviceBody`, `TrustedDevice` schemas), then `pnpm run codegen` (Orval) regenerated `@digihostel/api-zod` and `@digihostel/api-client-react` — never hand-edited. Both regenerated files typecheck and are consumed correctly by both the backend routes and the mobile orchestration layer.

## 16. Audit Logging

`device.challenge_issued` and `device.trusted` (success) and rejection reasons (`device.registration_rejected` with the specific `DeviceRegistrationFailureReason`) are written to `audit_logs`, fire-and-forget (`void this.writeAuditLog(...)`) so a logging failure can never block or fail the primary security decision — matching this codebase's existing `AuthOtpService` convention. No secret, OTP code, or raw attestation token is ever logged; only identifiers and outcome reasons.

## 17. Dependency Injection / Testability

`DeviceRegistrationService` takes three injected ports (`ChallengeRepository`, `AttestationVerifier`, `TrustedDeviceRepository`), mirroring `AuthOtpService`'s established pattern — unit tests use in-memory fakes (`__fixtures__/`), integration tests exercise the real Drizzle-backed implementations against real Postgres separately. This split is what let every failure-path permutation (§10) be tested deterministically without needing live Google credentials.

## 18. Native Module

A local (not standalone) Expo Module (`apps/parent-mobile/modules/play-integrity/`) was scaffolded via `create-expo-module`, corrected to Android-only (`expo-module.config.json`), and implemented with a real call into Google's Play Integrity Classic API (`IntegrityManagerFactory`, `IntegrityTokenRequest.setNonce()`/`.setCloudProjectNumber()`) — chosen over the Standard API specifically because the backend verifier's design is nonce-based, and over the unmaintained `react-native-google-play-integrity` npm package (last published mid-2024, no Expo config plugin, uncertain compatibility with this app's `newArchEnabled: true` setting). This module was **not compiled into a running dev-client build this task** — see §19 for why.

## 19. Deliberately Not Attempted: EAS Native Rebuild

Building the new native module into an actual installable Android dev client (via EAS Build) was considered and deliberately deferred, not attempted. Reasoning: without a real Play Console/Cloud Project number, the native call would only ever reach `IntegrityManagerFactory.requestIntegrityToken()` and fail (no valid cloud project to authenticate against) — a rebuild now would consume real EAS build minutes to produce a binary whose one new code path cannot be meaningfully exercised, and the binary would need rebuilding again once real credentials exist anyway. This is reported as an explicit judgment call, not a silent omission.

## 20. Physical-Device Re-Validation (TC-8.5 onward)

**Not performed, and cannot be performed to a genuine PASS in this environment.** TC-8.5 onward requires a real native Play Integrity call succeeding against Google's live servers on real hardware, which requires the Play Console/Cloud Project dependency named throughout this report. No simulated, mocked, or "assume it would work" substitute was used in its place — per this task's explicit no-bypass requirement, an honest BLOCKED status is reported instead of a fabricated PASS.

## 21. What Would Need To Change For a Genuine PASS

1. A real Google Play Console developer account (one-time $25 registration fee) and app entry for DigiHostel's Android package.
2. A linked Google Cloud project, with `EXPO_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER` set to its real project number and a service-account key configured server-side (`GOOGLE_PLAY_INTEGRITY_SERVICE_ACCOUNT_KEY`/`GOOGLE_PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER`).
3. An EAS native rebuild of the Android dev client to compile in the new `play-integrity` module (deferred, §19).
4. Re-running TC-8.5 onward on a real physical device against that real build, with the app-recognition-verdict enforcement question (currently deliberately not enforced — see `attestationVerifier.ts`'s code comment on EAS-distributed dev builds reporting `UNRECOGNIZED_VERSION`) revisited once a real Play Store distribution channel exists.
5. A separate, later decision on iOS App Attest/DeviceCheck, requiring Apple hardware and a paid Apple Developer account — entirely out of this pass's scope.

None of these are code changes to what has already been built; they are external account/credential/build-pipeline steps outside this session's authority, consistent with the user's own explicit choice not to pursue them now.
