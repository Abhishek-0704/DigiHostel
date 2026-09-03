# Parent Mobile Application — Authentication & Trusted Device Infrastructure

Prompt 3 (infrastructure) + Prompt 4A (Login/OTP presentation layer). This document is the reference for both. It does not describe biometric verification (Prompt 5) or full device management (Prompt 6).

## 1. Authentication Architecture

```
Mobile UI (Prompt 4A — Welcome/Login/OTP screens)
  → useAuth() (src/hooks/useAuth.ts)
    → AuthContext (src/contexts/AuthContext.tsx) — derives canonical status
      → authService (src/services/supabase/auth.ts) → Supabase Auth (session/OTP)
      → deviceService (src/services/devices/devices.ts) → Supabase Postgrest, RLS-scoped
  → generated API hooks (src/services/api) → Fastify REST API → Postgres
```

**Supabase Auth** (ADR-014) owns identity, phone-OTP delivery/verification (ADR-020), and session/JWT/refresh-token lifecycle. **Fastify** owns application authorization — role, parent-student relationship, and trusted-device checks — re-verified independently on every protected request, regardless of what this client believes. **RLS** is the database-level backstop beneath both. This app never re-implements any of the backend's authorization logic; it only reads, via RLS-scoped Supabase queries, the same facts the backend's own guards check.

## 2. Authentication Flow (as implemented)

1. Parent enters a phone number on the **Login** screen (`app/(auth)/login.tsx`).
2. `authService.sendOtp(phoneNumber)` — validates the format client-side (`src/features/authentication/validation.ts`, composing Prompt 3's `isValidPhoneNumber` with a fixed `+91` country code and a 10-digit local-number length check), then calls Supabase Auth's `signInWithOtp({ phone })`.
3. Parent enters the received code on the **OTP** screen (`app/(auth)/otp.tsx`).
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

## 13. UI Layer (Prompt 4A)

### Screen hierarchy

```
app/index.tsx                    Splash — presents useAuth().status, no redirect logic
app/(auth)/
  _layout.tsx                    Stack, headerShown: false
  welcome.tsx                    Intro + "Continue" -> login
  login.tsx                      Phone entry -> sendOtp() -> push to otp (with ?phone param)
  otp.tsx                        6-digit entry -> verifyOtp() -> AuthGate takes over on success
```

### Navigation flow

`Splash → Welcome → Login → OTP → (AuthGate redirects to (app) or (onboarding))`. Welcome→Login→Otp navigation is handled by the screens themselves via `expo-router`'s `useRouter().push` (same-group navigation, per `routeGuard.ts`'s design — AuthGate never interferes within a stable group). The OTP→authenticated transition is **not** navigated manually: `verifyOtp` establishes a real session, `AuthContext`'s existing device-check effect and `AuthGate` (both Prompt 3, untouched) pick it up and redirect on their own. The phone number is passed from Login to OTP as an Expo Router param (in-memory navigation state, not a literal URL/query string on native) — it is the user's own just-entered input, not a secret, so this does not conflict with the "never put tokens in URLs" rule.

### Component inventory (new in Prompt 4A)

- `src/components/ui/OTPInput.tsx` — segmented 6-digit entry. One real focusable `TextInput` (gets automatic focus/backspace/paste/OS-autofill for free) with decorative boxes rendered from its value; boxes are `accessibilityElementsHidden` so screen readers see exactly one control.
- `src/hooks/useReducedMotion.ts` — wraps `AccessibilityInfo.isReduceMotionEnabled()`; gates Splash's fade/scale.
- `src/features/authentication/validation.ts` — pure: `validateLocalPhoneNumber`, `sanitizeOtpInput`, `isCompleteOtp`. Composes Prompt 3's `isValidPhoneNumber`, does not reimplement it.
- `src/features/authentication/statusMessages.ts` — pure: `splashStatusMessage(status)`, the Splash screen's status copy.

No new shared UI primitive beyond `OTPInput` was needed — `Button`, `TextField`, `PageContainer`, `PageHeader`, `ErrorState`, `Loader` (all Prompt 2) covered every other surface.

### Validation responsibilities

Client-side format validation only (phone shape, OTP length/digits) — see `validation.ts`. Never asserts a phone number belongs to a real registered parent (no such field/return value exists anywhere in this module) — that determination is not made by the client, consistent with §2's documented backend gap.

### Loading / error / success states

Each screen owns its own local `isSubmitting`/`isVerifying`/`isResending` boolean (not read from `useAuth().status === "authenticating"`, which is shared across both actions and would conflate "my request" with "some other in-flight request") — matching this repo's "screens own presentation state, contexts own canonical state" convention. Errors render via each error's pre-approved `userMessage` only (§9's taxonomy) — inline (`TextField`/`OTPInput`'s own `errorMessage` prop) for field-specific problems, a `Text` block for submit-level errors. OTP success shows a brief "✓ Verified" state; no manual navigation or forced delay — AuthGate's own effect naturally provides a short, undelayed transition window.

### Animation summary

- Splash: fade (0→1 opacity) + scale (0.94→1) over 400ms, `useNativeDriver: true`, skipped entirely (final state applied immediately) when `useReducedMotion()` is true.
- Every other "animation" is inherited for free from the existing `Button` component's built-in press-opacity feedback (Prompt 2) — no new animation code was needed for CTA feedback.
- No looping/decorative animation anywhere; no animation blocks input or exceeds ~400ms.

### Accessibility

`accessibilityRole="header"` on screen titles; `accessibilityLabel`/`accessibilityHint` on every interactive control; `accessibilityRole="alert"` on error text; `accessibilityLiveRegion="polite"` on the Splash status line, the OTP resend countdown, and the OTP "Verified" success state; every tappable control meets the existing `Button`/`TextField` 44pt minimum touch target; no state is conveyed by color alone (error state always pairs a color change with text). OTP entry is screen-reader-usable via the single real `TextInput` (§ component inventory above) rather than six separately-focusable elements.

### Responsive layout

`PageContainer`'s safe-area handling (Prompt 2) covers device notches/safe areas on all screens. Login wraps its form in `KeyboardAvoidingView` (iOS `padding` behavior) so the keyboard never covers the input. No fixed pixel heights are used for text-bearing elements (OTP boxes are a fixed 48×56 hit-target, which is appropriate for a hit target, not body text, and remains legible under standard OS font-scaling since only the digit glyph inside scales, not the box). Not manually verified on a physical/simulated device or a rendered browser preview — see §14.

### Known deferred item

No dedicated Terms/Privacy screen exists — the SDD/ADRs name no such screen or content for this app, and inventing one with fabricated legal text was out of scope. Welcome includes a one-line, generic data-use reassurance instead.

## 14. Verification Boundary (Prompt 4A)

Verified this session: full workspace typecheck/lint/format, the complete Vitest suite (pure-logic tests for every new validation/status-message function), and a full production `expo export` Metro bundle (screens, `OTPInput`, and every new module compile and bundle with zero errors). **Not verified: an actual rendered screenshot.** This app's accepted architecture (ADR-004) targets iOS/Android only — `react-native-web` is not installed, and installing it solely to get a browser preview would itself be an unjustified dependency addition under this very prompt's own dependency-discipline rules. Component-level React Native rendering also remains unavailable under this repo's current Vitest setup (a still-open decision from Prompt 2 — `jest-expo` + `@testing-library/react-native` would be needed). Manual code review substituted for visual verification; a real device/simulator or Expo Go check is recommended before this UI ships.
