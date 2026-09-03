# Parent Mobile Application — Authentication & Trusted Device Infrastructure

Prompt 3 (Phase 2). This document is the reference for the authentication/security infrastructure implemented here — it does not describe Login/OTP UI (Prompt 4), biometric verification (Prompt 5), or full device management (Prompt 6).

## 1. Authentication Architecture

```
Mobile UI (Prompt 4)
  → useAuth() (src/hooks/useAuth.ts)
    → AuthContext (src/contexts/AuthContext.tsx) — derives canonical status
      → authService (src/services/supabase/auth.ts) → Supabase Auth (session/OTP)
      → deviceService (src/services/devices/devices.ts) → Supabase Postgrest, RLS-scoped
  → generated API hooks (src/services/api) → Fastify REST API → Postgres
```

**Supabase Auth** (ADR-014) owns identity, phone-OTP delivery/verification (ADR-020), and session/JWT/refresh-token lifecycle. **Fastify** owns application authorization — role, parent-student relationship, and trusted-device checks — re-verified independently on every protected request, regardless of what this client believes. **RLS** is the database-level backstop beneath both. This app never re-implements any of the backend's authorization logic; it only reads, via RLS-scoped Supabase queries, the same facts the backend's own guards check.

## 2. Authentication Flow (as implemented)

1. (Prompt 4) Parent enters a phone number.
2. `authService.sendOtp(phoneNumber)` — validates the format client-side (`src/utils/phone.ts`), then calls Supabase Auth's `signInWithOtp({ phone })`.
3. (Prompt 4) Parent enters the received code.
4. `authService.verifyOtp(phoneNumber, token)` — calls Supabase Auth's `verifyOtp(..., type: "sms")`, returns the real session on success.
5. `SessionContext` (Prompt 2, unchanged) observes the resulting session via `onAuthStateChange`.
6. `AuthContext` reacts to the new session by calling `deviceService.hasActiveTrustedDevice()` (a real, RLS-scoped query).
7. `AuthContext` derives one canonical `status` (§4) from all of the above.
8. `AuthGate` (§6) redirects based on that status: trusted device → `(app)`; no trusted device → `(onboarding)`.

**Known, documented gap — not fabricated, not silently hidden:** ADR-020 requires a roll-number-to-parent-record pre-check to run *before* step 2, so an OTP SMS is only ever sent to an already-registered parent's number. **That backend endpoint does not exist** (verified this session — `apps/api/src/routes` has only `health`, `leave`, `test-auth`). `sendOtp` as implemented will trigger a real SMS to any syntactically valid number. This is **not an application-authorization bypass** — the backend's `resolveAppProfile` (`apps/api/src/lib/auth/profile.ts`) returns `none` → 401 `no_app_profile` for any Supabase identity with no matching `parents` row, so an attacker gains no protected access this way — but it is a real SMS-cost/abuse exposure that should be closed by the backend pre-check endpoint, not invented here.

## 3. Session Lifecycle

`SessionContext` (Prompt 2, unaltered) remains the single source of raw Supabase session truth — initial restoration via `getSession()`, live updates via `onAuthStateChange`, tolerant of missing config (`configError`, not a crash). Token refresh is handled entirely by the Supabase SDK itself (`autoRefreshToken: true`, paused/resumed via `AppState` — `src/services/supabase/client.ts`, unchanged from Prompt 2) — no custom refresh logic exists anywhere in this app.

## 4. Canonical Auth Status

`AuthContext` derives one of eight states (`src/contexts/authStatus.ts`, pure and unit-tested):

| Status | Meaning | Redirect target |
|---|---|---|
| `initializing` | Session or device check not yet resolved | none (splash renders) |
| `unauthenticated` | No session | `(auth)` |
| `authenticating` | `sendOtp`/`verifyOtp` in flight | none |
| `authenticated` | Session + active trusted device | `(app)` |
| `device_verification_required` | Session, no active trusted device | `(onboarding)` |
| `session_expired` | Session unexpectedly became null (see below) | `(auth)` |
| `offline` | Device-status check failed with a network-classified error | none |
| `error` | Missing config, or an unclassified device-status failure | none |

**Known limitation, honestly documented:** distinguishing `session_expired` from a normal `unauthenticated` sign-out relies on an app-side heuristic (`AuthContext`'s `isSigningOutRef`) — the app tracks whether it itself just called `signOut()`; if a session becomes null *without* that, it's treated as an unexpected loss. Supabase-js v2 does not currently expose a distinct "refresh failed" event separate from `SIGNED_OUT`, so this is an approximation, not a guarantee from the SDK.

**Also known and honest:** the device-status query cannot currently distinguish "this Supabase identity has no `parents` row at all" from "valid parent, no trusted device yet" — both produce zero rows from `current_parent_id()` resolving to null, and both correctly route to `device_verification_required`. No product/security consequence today (the backend independently rejects a non-parent identity on any real business call regardless), but a dedicated backend profile-lookup endpoint would resolve the ambiguity if it ever matters.

## 5. Trusted Device

| Operation | Status | Mechanism |
|---|---|---|
| Status lookup (`hasActiveTrustedDevice`, `listTrustedDevices`) | **Real** | Direct Supabase query, RLS-scoped (`trusted_devices_select_own`) — verified against the real local Supabase instance and real seed fixtures (`devices.integration.test.ts`) |
| Registration (`registerCurrentDevice`) | **Fail-closed, unimplemented** | ADR-003 requires platform attestation *before* a device is marked trusted; no attestation-verification integration exists (mobile SDK or backend). RLS's `trusted_devices_insert_own` is technically permissive, but implementing registration as a raw INSERT would let this app mark itself trusted with no attestation ever having occurred — exactly the fabricated-success failure mode this prompt forbids (G-04). |
| Revocation (`revokeDevice`) | **Deferred, unimplemented** | Not a technical block (an RLS-scoped UPDATE limited to `revoked_at` would be safe — revocation only reduces access) — deferred because "Full Device Management" is explicitly Prompt 6's scope. |

**Device identity** (`src/services/deviceIdentity/deviceIdentity.ts`): a random UUID (`expo-crypto`'s `randomUUID()`), generated once and persisted via secure storage. **Not** derived from any hardware identifier — no IMEI, serial number, MAC address, Android ID, or iOS `identifierForVendor` is read anywhere in this app. Uninstalling and reinstalling the app produces a new identifier by design.

## 6. Route Protection

`AuthGate` (`src/navigation/AuthGate.tsx`, wired into `app/_layout.tsx`) redirects between the `(auth)`, `(onboarding)`, and `(app)` route groups based on `AuthContext`'s status. The actual decision logic (`src/navigation/routeGuard.ts`) is pure and independently unit-tested (13 cases, including explicit redirect-loop prevention). This is a **UX/navigation mechanism only** — Fastify's guards and RLS remain the real security boundary; hiding a route from navigation has never granted or denied access to backend data on its own.

## 7. Secure Storage

| Item | Where | Why |
|---|---|---|
| Supabase session | `expo-secure-store`, via the `storage` adapter passed to `createClient` (Prompt 2, unchanged) | Supabase's own SDK manages the key name internally |
| Device installation ID | `expo-secure-store`, key `digihostel.parent.device-installation-id` | Persists the app-generated UUID across restarts (not across reinstalls) |
| Theme preference | `expo-secure-store` (Prompt 2, unchanged) | Reuses the existing secure-storage abstraction rather than adding a second storage dependency |

**Never stored, anywhere in this app:** OTP codes, passwords, biometric data, service-role keys, database credentials, or any backend secret.

## 8. Security Logging

`logger` (Prompt 2) is used for: OTP send/verify attempts and outcomes, device-trust check outcomes, sign-out. Phone numbers are **always masked** before logging (`maskPhoneNumber` — keeps only the last 2 digits). **Never logged:** the OTP code itself, access/refresh tokens, or the `Authorization` header.

## 9. Error Handling

`src/types/errors.ts`'s taxonomy was extended with 11 auth/device-specific kinds (`invalid_phone_number`, `otp_send_failed`, `otp_expired`, `otp_invalid`, `otp_rate_limited`, `auth_provider_unavailable`, `session_restore_failed`, `session_refresh_failed`, `device_not_trusted`, `device_revoked`, `device_registration_unavailable`), each with a pre-approved safe message. `src/services/supabase/authErrors.ts` classifies raw Supabase errors using the SDK's own documented error-code enum and type guards (`isAuthApiError`/`isAuthRetryableFetchError`) — never by displaying the raw message.

## 10. Current Backend Dependencies (verified this session)

| Capability | Status |
|---|---|
| Supabase Auth phone-OTP (send/verify) | Ready — no backend blocker |
| Roll-number-to-parent pre-check | **Missing** (ADR-020's own requirement) |
| Device registration / attestation verification | **Missing** (G-04) |
| Device revocation endpoint | Not needed — RLS supports a direct client UPDATE; not built in this prompt (Prompt 6 scope) |
| `GET /api/v1/leave-requests` (parent-scoped) | Ready (G-05, closed in a prior phase) |

## 11. Known Limitations

- SMS-cost/abuse exposure from the missing pre-check (§2).
- `session_expired` detection is a heuristic, not an SDK guarantee (§4).
- Cannot distinguish "no parent profile" from "no trusted device yet" (§4).
- No real device-registration or revocation flow exists (§5) — routes stay on Prompt 2's placeholder screens.

## 12. Future Biometric Integration Boundary

Prompt 5 owns biometric enrollment/verification. This prompt's `useBiometric`/`biometricService` (Prompt 2) remain untouched, fail-closed placeholders. The eventual real implementation must remain a **client-side UX gate only** — the server-side biometric-freshness check (`AssertionPresenceBiometricFreshnessGate`, currently a documented non-cryptographic placeholder) is a separate, backend-owned concern this app does not and should not try to compensate for.
