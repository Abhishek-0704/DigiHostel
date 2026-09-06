# Parent Mobile Application — Authentication & Trusted Device Infrastructure

Prompt 3 (infrastructure) + Prompt 4A (Login/OTP presentation layer) + Prompt 4B (Trusted Device Registration UI & Device Management) + Prompt 5 (Biometric Authentication Infrastructure) + Prompt 6 (Trusted Device Security Center). This document is the reference for all five.

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

**F-02 remediation (PRR Phase 13):** the flow below replaces the earlier
direct-to-Supabase design. The client never collects, holds, or submits a
phone number anywhere in login; the backend resolves the authoritative
parent phone entirely server-side (ADR-020's required roll-number-to-parent
pre-check) and brokers both `signInWithOtp`/`verifyOtp` calls itself.

1. Parent enters their ward's **roll number** and selects their
   **relationship** (father/mother/guardian) on the **Login** screen
   (`app/(auth)/login.tsx`) — no phone field exists on this screen.
2. `useAuth().requestOtp(rollNumber, relationshipType)` →
   `otpEligibilityService.requestOtp` → `POST /api/v1/auth/otp/request`. The
   backend resolves eligibility (`students` → `parent_student_relationships`
   → `parents`) and, if eligible, dispatches an OTP itself using its own
   anon-keyed Supabase client (`SupabaseOtpSender`) — this app never calls
   `signInWithOtp`. The response is always `{ challengeId }`, identically
   shaped regardless of eligibility (anti-enumeration) — this app cannot and
   does not learn whether the roll number/relationship is registered.
3. Parent enters the received code on the **OTP** screen
   (`app/(auth)/otp.tsx`), which carries the opaque `challengeId` (plus
   `rollNumber`/`relationshipType`, kept only so "resend" can request a
   fresh challenge).
4. `useAuth().verifyOtp(challengeId, code)` →
   `otpEligibilityService.verifyOtp` → `POST /api/v1/auth/otp/verify`. The
   backend looks up the phone bound to `challengeId` server-side and calls
   `verifyOtp` itself, returning real Supabase session tokens
   (`{accessToken, refreshToken}`) — never a phone number.
5. `authService.adoptSession(accessToken, refreshToken)` calls
   `getSupabaseClient().auth.setSession(...)` to locally establish the
   session the backend already obtained — this is the only Supabase Auth
   SDK call this app makes as part of login, preserving ADR-014's "client
   manages its own session via the SDK" boundary.
6. `SessionContext` (Prompt 2, unchanged) observes the resulting session via
   `onAuthStateChange`.
7. `AuthContext` reacts to the new session by calling
   `deviceService.hasActiveTrustedDevice()` (a real, RLS-scoped query).
8. `AuthContext` derives one canonical `status` (§4) from all of the above.
9. `AuthGate` (§6) redirects based on that status: trusted device → `(app)`;
   no trusted device → `(onboarding)`.

The previously-documented gap here (an arbitrary syntactically-valid phone
number could trigger a real SMS, with no server-side check that it belonged
to a registered parent) is closed by this design — see
`apps/api/src/domain/auth/` for the backend eligibility gate and
`docs/current-state.md` for the closure record.

## 3. Session Lifecycle

`SessionContext` (Prompt 2, unaltered) remains the single source of raw Supabase session truth — initial restoration via `getSession()`, live updates via `onAuthStateChange`, tolerant of missing config (`configError`, not a crash). Token refresh is handled entirely by the Supabase SDK itself (`autoRefreshToken: true`, paused/resumed via `AppState` — `src/services/supabase/client.ts`, unchanged from Prompt 2) — no custom refresh logic exists anywhere in this app.

## 4. Canonical Auth Status

`AuthContext` derives one of eight states (`src/contexts/authStatus.ts`, pure and unit-tested):

| Status | Meaning | Redirect target |
|---|---|---|
| `initializing` | Session or device check not yet resolved | none (splash renders) |
| `unauthenticated` | No session | `(auth)` |
| `authenticating` | `requestOtp`/`verifyOtp` in flight | none |
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
| Status lookup (`hasActiveTrustedDevice`) | **Real** | Direct Supabase query, RLS-scoped (`trusted_devices_select_own`), active devices only — verified against the real local Supabase instance and real seed fixtures (`devices.integration.test.ts`) |
| Full list (`listTrustedDevices`) | **Real (Prompt 3, extended Prompt 4B)** | Same RLS policy, but deliberately unfiltered — returns active **and** revoked rows (Prompt 4B's device-management UI needs real revoked-device history, not just the active count `hasActiveTrustedDevice` needs). Also computes a genuinely-derived `isCurrentDevice` (§15) — never hardcoded. |
| Registration (`registerCurrentDevice`) | **Fail-closed, unimplemented** | ADR-003 requires platform attestation *before* a device is marked trusted; no attestation-verification integration exists (mobile SDK or backend). RLS's `trusted_devices_insert_own` is technically permissive, but implementing registration as a raw INSERT would let this app mark itself trusted with no attestation ever having occurred — exactly the fabricated-success failure mode this prompt forbids (G-04). Prompt 4B built the full registration UI around this call; the call itself is unchanged. |
| Revocation (`revokeDevice`) | **Fail-closed, unimplemented (Prompt 4B)** | Not a technical RLS block (`trusted_devices_revoke_own` would permit a scoped UPDATE) — deferred because a raw client UPDATE would revoke a device with no backend-owned audit trail or coordination with `device_attestation_events`, which is exactly the "backend security logic in the client" Prompt 4B's own instructions forbid inventing. Prompt 4B built the full removal UI (confirm → in-progress → result) around this call; the call itself always rejects. |

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

`logger` (Prompt 2) is used for: OTP request/verify/adopt-session attempts and outcomes, device-trust check outcomes, sign-out. This app never holds a phone number at any point in login, so there is nothing phone-related to mask (the earlier `maskPhoneNumber` helper was removed as part of F-02 — see §2). **Never logged:** the OTP code itself, access/refresh tokens, the `Authorization` header, or a roll number's resolved eligibility outcome (would itself be an enumeration side-channel).

## 9. Error Handling

`src/types/errors.ts`'s taxonomy carries auth/device-specific kinds (`otp_invalid`, `otp_rate_limited`, `auth_provider_unavailable`, `session_restore_failed`, `session_refresh_failed`, `device_not_trusted`, `device_revoked`, `device_registration_unavailable`), each with a pre-approved safe message. `src/services/supabase/authErrors.ts` classifies raw Supabase errors from `adoptSession`'s `setSession` call using the SDK's own documented error-code enum and type guards (`isAuthApiError`/`isAuthRetryableFetchError`); `src/features/authentication/otpErrors.ts` classifies HTTP errors from the backend's OTP request/verify endpoints by status code. Neither ever displays a raw message, and neither invents a distinction the backend's anti-enumeration design deliberately doesn't expose (e.g. "expired" vs. "wrong" code both collapse to `otp_invalid`).

## 10. Current Backend Dependencies

| Capability | Status |
|---|---|
| `POST /api/v1/auth/otp/request` / `/verify` (eligibility-gated OTP broker) | **Ready** — closed the roll-number-to-parent pre-check gap (ADR-020, F-02 remediation) |
| Device registration / attestation verification | **Missing** (G-04) |
| Device revocation endpoint | **Missing** — RLS would technically permit a direct client UPDATE, but Prompt 4B deliberately did not implement one as a raw client write (see §5/§15's reasoning) |
| `GET /api/v1/leave-requests` (parent-scoped) | Ready (G-05, closed in a prior phase) |

## 11. Known Limitations

- `session_expired` detection is a heuristic, not an SDK guarantee (§4).
- Cannot distinguish "no parent profile" from "no trusted device yet" (§4).
- No real device-registration or revocation *backend operation* exists (§5) — but the full registration/list/details/remove/replace **UI** is real as of Prompt 4B (§15); every write path correctly fails closed with an honest, pre-approved message rather than fabricating success.

## 12. Biometric Integration Boundary (superseded by §16)

This section originally deferred biometric enrollment/verification to Prompt 5 and described `useBiometric`/`biometricService` as fail-closed placeholders. **As of Prompt 5, both are real** — see §16 for the full implementation. The core boundary this section originally stated remains true and unchanged: the real implementation is a **client-side UX gate only** — the server-side biometric-freshness check (`AssertionPresenceBiometricFreshnessGate`, still a documented non-cryptographic placeholder) is a separate, backend-owned concern this app does not and cannot compensate for from the client.

## 13. UI Layer (Prompt 4A)

### Screen hierarchy

```
app/index.tsx                    Splash — presents useAuth().status, no redirect logic
app/(auth)/
  _layout.tsx                    Stack, headerShown: false
  welcome.tsx                    Intro + "Continue" -> login
  login.tsx                      Roll number + relationship -> requestOtp() -> push to otp (with ?challengeId param)
  otp.tsx                        6-digit entry -> verifyOtp() -> AuthGate takes over on success
```

### Navigation flow

`Splash → Welcome → Login → OTP → (AuthGate redirects to (app) or (onboarding))`. Welcome→Login→Otp navigation is handled by the screens themselves via `expo-router`'s `useRouter().push` (same-group navigation, per `routeGuard.ts`'s design — AuthGate never interferes within a stable group). The OTP→authenticated transition is **not** navigated manually: `verifyOtp` establishes a real session (via `adoptSession`), `AuthContext`'s existing device-check effect and `AuthGate` (both Prompt 3, untouched) pick it up and redirect on their own. `challengeId`/`rollNumber`/`relationshipType` are passed from Login to OTP as Expo Router params (in-memory navigation state, not a literal URL/query string on native) — none is a secret (the challenge id is a single-use, short-lived reference, and the roll number/relationship are the user's own just-entered input), so this does not conflict with the "never put tokens in URLs" rule. No phone number is ever passed as a param — this app never receives one.

### Component inventory (new in Prompt 4A, updated for F-02)

- `src/components/ui/OTPInput.tsx` — segmented 6-digit entry. One real focusable `TextInput` (gets automatic focus/backspace/paste/OS-autofill for free) with decorative boxes rendered from its value; boxes are `accessibilityElementsHidden` so screen readers see exactly one control.
- `src/hooks/useReducedMotion.ts` — wraps `AccessibilityInfo.isReduceMotionEnabled()`; gates Splash's fade/scale.
- `src/features/authentication/validation.ts` — pure: `isValidRollNumber`, `RELATIONSHIP_OPTIONS`, `sanitizeOtpInput`, `isCompleteOtp`. The earlier phone-format validation (`validateLocalPhoneNumber`, `isValidPhoneNumber`) was removed with the phone field itself (§2).
- `src/features/authentication/otpErrors.ts` — pure: `mapOtpError`, classifies HTTP errors from the backend's OTP broker endpoints.
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

A later session did perform live, on-device verification of Prompt 4A (Android emulator, then a real USB-connected phone) — it found and fixed one genuine pre-existing defect (§section below has no number here since it predates this doc's Prompt 4B section — see git history around commit tag "Prompt 4A native visual verification" for the full report) and exhaustively diagnosed that Expo Go's own client (independent of this app's code) fails to stay resident in this specific development environment (a campus network with apparent device-to-device isolation, and — separately — a total absence of the Android emulator's outbound network egress in this sandbox). That diagnosis is the basis for §15's own verification-boundary note below, since the same environment characteristics apply to Prompt 4B.

## 15. Trusted Device Registration UI & Management (Prompt 4B)

### Screen hierarchy

```
app/(onboarding)/devices.tsx        Register Trusted Device — idle -> registering -> failed
                                     (state-driven; no separate routes for each state)

app/(app)/security/
  index.tsx                         Trusted Device List — loading/loaded/empty/refreshing/error
  [deviceId].tsx                    Device Details — viewing -> confirm-remove/confirm-replace
                                     -> removing/replacing -> result (state-driven; Remove
                                     Confirmation and Replace Device Workflow are both panels on
                                     THIS one screen, not separate routes)
  tips.tsx                          Device Security Tips — static content, standalone
```

Registered in `app/(app)/_layout.tsx`'s `<Stack>` (`security/index`, `security/[deviceId]`, `security/tips`, each with `headerShown: true` and a real title) exactly like every other `(app)` route.

Twelve of the thirteen screen-inventory items this prompt named are covered by the four route files above via state-driven rendering (per the prompt's own "don't create a route for every visual state" instruction) — see the State Model below for exactly which UI state corresponds to which named item (Device Verification In Progress, Device Successfully Registered, Device Registration Failed, Device Revoked, Remove Device Confirmation, Replace Device Workflow, and the loading/error/empty states are all states, not routes). The thirteenth (Device Details) and the standalone Security Tips screen are the only genuinely separate routes needed.

### Navigation flow

```
AuthGate: device_verification_required -> (onboarding)/devices
  (unchanged Prompt 3 mechanism — see §6. This screen does not navigate
  itself on success; if registerCurrentDevice() ever succeeds, useDevice's
  register() calls AuthContext.refreshDeviceStatus(), and AuthGate's own
  effect redirects to (app) on its own, exactly like OTP verification does.)

(app)/security/index (Trusted Device List)
  -> tap a DeviceCard -> (app)/security/[deviceId] (Device Details)
  -> "Learn more about device security" -> (app)/security/tips
```

**A discovered navigation-architecture constraint, not fixed here:** `(app)/security/tips` is only reachable once `AuthGate`'s status is `authenticated` (i.e. the parent already has at least one active trusted device) — `resolveRedirect` (`src/navigation/routeGuard.ts`, Prompt 3, unchanged) bounces any `(app)` segment back to `(onboarding)` while status is `device_verification_required`. This means the onboarding registration screen **cannot** link to the standalone Security Tips route. Rather than modify `routeGuard.ts`'s redirect logic (out of this prompt's scope — "do not create a duplicate trusted-device state machine," "preserve the existing Expo Router architecture"), the onboarding screen inlines the same underlying content directly via `SecurityInformationCard` (a different section set — `DEVICE_REGISTRATION_SECTIONS` vs. the Tips screen's `DEVICE_SECURITY_TIPS` — both from the one shared `deviceContent.ts` source, so the copy itself never forks even though it's rendered in two different places for two different route-reachability reasons).

### Component inventory

**Reused unchanged:** `PageContainer`, `PageHeader`, `Card`, `Divider`, `Button` (including its existing `danger` variant for destructive actions), `Loader`, `ErrorState`, `EmptyState`, `Badge` (via the new `DeviceStatusBadge` wrapper).

**New — generic, `src/components/feedback/`:**
- `SuccessState.tsx` — the third member of the `EmptyState`/`ErrorState` trio (same shape: title/description/optional action). Wired into the registration state model but not reachable today, since `registerCurrentDevice()` always rejects (see State Model).

**New — device-domain, `src/features/devices/components/`:**
- `DeviceCard.tsx` — one row in the Trusted Device List. Shows only backend-real fields (see Backend Integration Boundaries below).
- `DeviceStatusBadge.tsx` — thin wrapper mapping `getDeviceTrustState()` to `Badge`'s tone/label — the exact extension point `Badge`'s own doc comment anticipated.
- `SecurityInformationCard.tsx` — renders a `DeviceInfoSection[]` (title/body pairs) inside a `Card`; the one renderer for both `DEVICE_REGISTRATION_SECTIONS` and `DEVICE_SECURITY_TIPS`.
- `SecurityBanner.tsx` — a single-line, restrained reassurance/warning banner (tinted surface + colored left accent, never a saturated full-color fill, matching the "calm, professional" direction). Color is never the only signal — the message text always states the state in words.

**Deliberately not built** (see `component_inventory`'s own "search for an existing equivalent... avoid component proliferation" instruction):
- `RegistrationProgress` / `VerificationLoader` — no real multi-stage backend process exists to represent (see State Model); the existing `Loader` + a plain status line covers the one real "request in flight" state honestly, without inventing fake stages or percentages.
- `DeviceTimeline` — a device has at most two real dated events (`registeredAt`, optionally `revokedAt`); a full timeline-visualization component would be over-engineering for two data points. Device Details renders them as plain labeled rows instead.
- `ConfirmationDialog` — Remove and Replace are both inline state panels on Device Details (not modals), so no modal/dialog primitive was needed at all.

**New — hooks:** `useDevice` (Prompt 2/3 foundation) extended, not replaced, with `register()`/`isRegistering`/`registrationError` and `revoke(id)`/`isRevoking`/`revocationError`, alongside its existing `devices`/`isLoading`/`error`/`refresh`. Both mutation actions call `AuthContext.refreshDeviceStatus()` on success (not reachable today, but architecturally correct for when a real backend operation exists) — matching this prompt's "after mutations, allow the backend response to determine final state" instruction.

**New — pure logic, `src/features/devices/`:** `deviceDisplay.ts` (`deviceDisplayName`, `formatDeviceDate`), `deviceStatus.ts` (`getDeviceTrustState`, `canRemoveDevice`, `canReplaceDevice`), `deviceErrors.ts` (`mapDeviceError` — mirrors `authErrors.ts`'s `mapAuthError` pattern), `deviceContent.ts` (the shared education-copy source), `registrationState.ts` (`registrationStatusMessage`). All independently unit-tested, no React/RN import.

**Services/types changed:**
- `src/services/devices/devices.ts` — `TrustedDeviceSummary` gained `revokedAt`/`revokedReason` (both real DB columns, previously not selected at all); `listTrustedDevices()` now returns every device (active **and** revoked) instead of silently matching `hasActiveTrustedDevice()`'s active-only filter, and computes `isCurrentDevice` by genuinely comparing the row's `device_fingerprint` against `deviceIdentityService.getInstallationId()` (previously hardcoded to `false`). `device_fingerprint` itself is never included in the returned type — used only internally for that one comparison.
- `src/services/devices/deviceServiceErrors.ts` (**new**) — `DeviceServiceNotImplementedError` was extracted out of `devices.ts` into its own zero-dependency file. Reason: `devices.ts` now imports `deviceIdentityService`, which imports `expo-crypto`/`react-native`/`expo-constants` — none parseable under a plain Vitest/Node run. Any pure-logic module that only needs the error *class* (e.g. `deviceErrors.ts`) imports it from here, not from `./devices`, so it stays testable without mocking the whole service's dependency chain. `devices.ts` re-exports it for backward compatibility with existing imports.
- `src/types/errors.ts` — one new kind, `device_removal_unavailable` ("Removing this device isn't available yet. Please try again later."), extending the existing taxonomy (matching exactly how Prompt 3 added its 11 auth/device kinds) — not a parallel taxonomy.

### State model

**Registration (`app/(onboarding)/devices.tsx`, `RegistrationUiState`):**
- `idle` — `SecurityInformationCard` (why/how/what's-stored/what's-not/after/if-it-fails) + "Verify this device" button.
- `registering` — real, since it's a real in-flight async call; `Loader` + "Verifying your device…" (also announced via `accessibilityLiveRegion="polite"`). Not a fake multi-step progress bar — there are no real intermediate stages to show.
- `failed` — `ErrorState` rendering the pre-approved `device_registration_unavailable` message, with a "Try again" retry that re-invokes the same call.
- *(Successfully Registered — not a distinct local state; `useDevice().register()`'s success path calls `refreshDeviceStatus()`, and `AuthGate` redirects away from this screen entirely once `AuthContext.status` becomes `authenticated`. `SuccessState` exists as a component but has no call site in this screen for that reason — there is nothing to show on this screen once success actually redirects away.)*

**Device Details (`app/(app)/security/[deviceId].tsx`, `DetailUiState`):**
- `viewing` — device fields (Backend Integration Boundaries below) + trust-state banner (revoked only) + current-device banner (current only) + "Replace"/"Remove" buttons (active devices only — `canReplaceDevice`/`canRemoveDevice`).
- `confirm-remove` — explains the irreversible consequence, then `Cancel`/`Remove device`; while the call is in flight shows `Loader`; on failure shows `ErrorState` with retry; on success returns to `viewing` with the list refreshed.
- `confirm-replace` — explains what replacement does and does **not** do ("won't automatically remove [this device]'s access" — an intentionally non-presumptive statement, since neither the SDD nor any accepted ADR states that replacement auto-revokes the old device), then `Cancel`/`Start verification`; same in-flight/failure/success shape as remove, reusing the same registration call as onboarding.
- Trust state (`active`/`revoked`) is derived, not stored — `getDeviceTrustState(device) = device.revokedAt === null ? "active" : "revoked"`.

**Trusted Device List (`app/(app)/security/index.tsx`):** `loading` (first fetch, full-page `Loader`) → `loaded` (`FlatList` of `DeviceCard`) or `empty` (`EmptyState`, zero devices) or `error` (zero devices AND a fetch error → full-page `ErrorState`) → `refreshing` (pull-to-refresh via `RefreshControl`, independent of the initial-load state so an error on refresh doesn't blank an already-loaded list).

**Not implemented — no device limit exists.** `packages/db/src/schema/device.ts` has no count-based constraint (only a per-parent uniqueness index on `parent_id`+`device_fingerprint`, which prevents registering the exact same fingerprint twice, not a maximum device count) — the "device limit reached" journey named in this prompt was deliberately not built, per the prompt's own "if no limit exists in the actual architecture, do not invent one" instruction.

### UX summary

Security is communicated in the specific, backed language this prompt's own `security_ux` section models ("Your device is trusted," "This device is no longer trusted and can't approve leave requests") — never an unsupported claim like "cryptographically verified" or "securely attested" (verified by `deviceContent.test.ts`'s own content-scan test, which fails if any of those words appear anywhere in the shared copy). Transparency comes from the registration screen answering all six of this prompt's required questions (why/how/what's-stored/what's-not/after/if-it-fails) in plain language before any action is requested, and from Device Details showing exactly what the backend actually knows about a device — nothing more, nothing invented. Simplicity comes from the deliberately small state surface (three registration states, three detail states) and from never presenting a route the user can't act on (see the Screen Hierarchy note on why twelve of thirteen "screens" are states, not routes).

### Accessibility checklist

| Requirement | Status | Note |
|---|---|---|
| Minimum comfortable touch targets | PASS | Every button reuses the existing `Button` (44pt minimum, unchanged from Prompt 2/4A); `DeviceCard`'s whole row is the tap target, well over 44pt |
| Accessible labels | PASS | `DeviceCard` composes one `accessibilityLabel` summarizing name + current-device + trust state + registration date, so a screen-reader user gets the full card content without needing to inspect it visually |
| Meaningful button names | PASS | "Verify this device," "Replace this device," "Remove this device," "Remove device," "Start verification" — no bare "OK"/"Confirm" |
| Screen-reader semantics | PASS | `PageHeader` titles carry `accessibilityRole="header"` (unchanged component); `SecurityBanner` uses `accessibilityRole="alert"` for warning/error tones, `"text"` for info/success |
| Accessible status/error announcements | PASS | `accessibilityLiveRegion="polite"` on the registration screen's status text; `ErrorState`/`SuccessState` both carry `accessibilityRole` (`alert`/`text`) so their own mount is announced |
| Scalable typography | PASS | All text uses the existing `typography`/inline-`fontSize` convention already established (Prompt 2/4A) — no fixed-height text container that would clip under OS font scaling |
| Sufficient contrast | PASS | All text/background pairs come from `theme.colors`' existing semantic roles (unchanged token values from Prompt 2), not new literals |
| No colour-only status communication | PASS | `DeviceStatusBadge`'s label text ("Trusted"/"Revoked") always accompanies its tone color; `SecurityBanner`'s message text always states the condition in words |
| Logical focus order | PASS | Standard top-to-bottom document order in every screen; no manual focus manipulation, `tabIndex`, or reordering was added |
| Dialogs correctly announced | N/A | No modal/dialog primitive exists in this implementation (Remove/Replace are inline panels, not dialogs) — nothing to report here |
| Destructive actions clearly identified | PASS | "Remove this device"/"Remove device" use `Button`'s existing `danger` variant (distinct color + always paired with explanatory text, never color alone) |

### Animation summary

No new animation was added. `Button`'s existing press-opacity feedback (Prompt 2, unchanged) covers every button in this prompt's screens. `Loader`'s `ActivityIndicator` is itself the only "motion" during registration/removal/replacement — no custom transition, fade, or progress animation was introduced, consistent with "never display fake progress for an operation whose progress can't be measured" and "avoid animations that hide application state." `useReducedMotion` (Prompt 4A) is not invoked here because nothing in this prompt's screens uses `Animated` — there is no motion to reduce.

### Backend integration boundaries

Fields shown, all real: `platform` (→ `deviceDisplayName`), `registeredAt` (→ `formatDeviceDate`), `revokedAt`/`revokedReason` (shown only when present), trust status (derived from `revokedAt`), current-device indicator (derived by comparing `device_fingerprint` to this installation's own id).

Fields deliberately **never** shown, because the backend has no such column: a "friendly device name" (no such field in `trusted_devices` — `deviceDisplayName` derives a label from `platform` instead, never fabricating a name), "last active" (no such column — genuinely absent, not merely unwired). Per-event attestation history (`device_attestation_events` — RLS-readable by the owning parent via `dae_select_own`, confirmed during reconnaissance) was considered and **deliberately deferred**: since no device has ever been registered from this app, that table would be empty for every real user today, and adding a second real-time query surface for data that can't yet exist felt like premature scope for this pass — a genuine future capability, not a missing one, tracked here rather than silently dropped.

The raw `trusted_devices.id` UUID and the `device_fingerprint` value are never rendered as visible text anywhere — `id` is used only as a React list key and as the `[deviceId]` route param (an internal reference, not a display value); `device_fingerprint` never leaves `devices.ts` at all.

### Future extensibility

- If a real attestation-verification integration point is ever built (mobile SDK + backend, per ADR-003's remaining gap), `registerCurrentDevice()`/`revokeDevice()` are the only two functions that need to change from throwing to actually performing the operation — every screen, hook, and component in this prompt already correctly handles both the loading and success paths; only the failure path currently has a call site.
- If `device_attestation_events` reads are ever added, `SecurityInformationCard`'s section-list rendering pattern can display them without a new component — just a new `DeviceInfoSection[]`-shaped mapping function in `deviceDisplay.ts`.
- If a device-count limit is ever introduced at the backend (it does not exist today — see State Model), the `canRemoveDevice`/`canReplaceDevice` pure functions in `deviceStatus.ts` are the natural place to add a limit-aware variant, without touching any screen.

### Verification boundary (Prompt 4B)

Verified this session: full workspace typecheck/lint/format, the complete Vitest suite (24 new pure-logic tests across `deviceDisplay`/`deviceStatus`/`deviceErrors`/`deviceContent`/`registrationState`, plus the extended `devices.test.ts`/`devices.integration.test.ts` — see the Tests section of this prompt's own final report), a full workspace build (including the runtime-resolution check), `expo-doctor` (18/18), and a full production `expo export` (zero errors). **Not verified: an actual rendered screenshot of any Prompt 4B screen.** No Android emulator or USB device was connected to this environment at the point this prompt's implementation was completed. This is consistent with, not a new instance of, the environment-level blocker exhaustively diagnosed for Prompt 4A (§14's addendum above) — an emulator in this specific sandbox has no outbound network egress, and Expo Go's own client independently fails a "check for updates" step on the one real device tested, for reasons unrelated to any app code. Manual code review substituted for visual verification.

## 16. Biometric Authentication Infrastructure (Prompt 5)

### Architecture summary

```
Screen (biometric.tsx, [deviceId].tsx's Remove/Replace panels, any future
  sensitive-action screen)
  → useBiometric() (src/hooks/useBiometric.ts) — the ONLY sanctioned
    entry point; no screen calls the service or expo-local-authentication
    directly
    → biometricService (src/services/biometric/biometric.ts)
      → expo-local-authentication (real platform API, Prompt 5)
    → biometricPreferenceService (src/services/biometric/biometricPreference.ts)
      → secureStorage (Prompt 2, unchanged) — one boolean preference only
```

Biometric state is **deliberately not part of `AuthContext`/`authStatus`/`AuthGate`**. No accepted ADR or SDD text makes biometric status a routing decision the way trusted-device status is (`device_verification_required` exists; there is no equivalent `biometric_required` auth status, and none was added). Adding one would have been a second, competing authentication state machine — exactly what this prompt's own instructions forbid. Biometric state is a small, self-contained concern any screen can consume via `useBiometric()`, orthogonal to route protection.

### Platform integration

`expo-local-authentication@~17.0.9` (SDK-54-compatible, resolved via `npx expo install`) was added — the only new dependency this prompt introduced. It was not previously installed (`src/services/biometric/biometric.ts` was a Prompt 2 fail-closed placeholder interface with no native backing). The package's actual installed TypeScript definitions were read directly (`node_modules/.pnpm/expo-local-authentication@17.0.9.../build/LocalAuthentication.types.d.ts`) before writing any mapping code, rather than assumed from memory.

`app.json` gained the package's config plugin with an explicit, accurate `faceIDPermission` string (no misleading claim — it names exactly what the permission is used for): `"DigiHostel uses Face ID to confirm it's you before approving sensitive actions, like a leave decision or removing a trusted device."` No Android manifest changes were needed — the package's own autolinked `AndroidManifest.xml` supplies `USE_BIOMETRIC`/`USE_FINGERPRINT`.

### Capability detection

`biometricService.getCapabilities()` combines four real platform calls (`hasHardwareAsync`, `isEnrolledAsync`, `supportedAuthenticationTypesAsync`, `getEnrolledLevelAsync`) into one `BiometricCapabilities` object:

```ts
interface BiometricCapabilities {
  hardwareAvailable: boolean;
  enrolled: boolean;
  supportedMethods: ("fingerprint" | "facial" | "iris")[];
  securityLevel: "none" | "device_credential" | "biometric_weak" | "biometric_strong";
  deviceCredentialAvailable: boolean; // derived, not separately queried
}
```

`deviceCredentialAvailable` is the one derived field — any enrolled `securityLevel` above `"none"` necessarily means a device credential exists too, since both platforms require one as an enrollment prerequisite. Nothing else is derived speculatively: hardware presence is never used to infer enrollment, and enrollment is never used to infer trust or identity. A native-module failure during the capability check fails closed to the all-unavailable shape (`UNAVAILABLE_CAPABILITIES`), logged via `logger.warn`, never silently treated as "available."

**Strong vs. weak (Android only):** `expo-local-authentication` exposes Android's Class 3 ("strong" — fingerprint, 3D face) vs. Class 2 ("weak" — 2D camera face unlock) distinction via `SecurityLevel.BIOMETRIC_STRONG`/`BIOMETRIC_WEAK`; iOS has no weak-biometric concept (the library's own doc comment: "There are currently no weak biometric authentication options on iOS"). Every `authenticateAsync` call this service makes explicitly requests `biometricsSecurityLevel: "strong"` — the library's own default is `"weak"`, so this is a deliberate override, not an accident. This is a documented **engineering judgment call**, not a literal SDD-mandated parameter (the SDD does not specify this exact value): a spoofable 2D-camera face unlock should not gate approval of a minor's hostel leave or removal of trusted-device access. Because `disableDeviceFallback` stays `false`, a user whose only enrolled method is weak biometric is never locked out by this — the OS offers the device passcode instead, which both platforms already treat as an acceptable device-owner proof.

### Authentication result taxonomy

`BiometricResultKind`: `success | user_cancelled | authentication_failed | temporary_lockout | permanent_lockout | not_enrolled | hardware_unavailable | not_supported | system_cancelled | timeout | device_credential_required | unknown_error`.

Mapped from the platform's own `LocalAuthenticationError` union by `src/services/biometric/biometricErrors.ts`'s `mapPlatformAuthError` — classification only, never a raw platform string surfaced to a screen. One documented, unavoidable limitation: `expo-local-authentication` collapses Android's `ERROR_LOCKOUT` and `ERROR_LOCKOUT_PERMANENT` into a single `'lockout'` string, so this mapper can only ever produce `temporary_lockout` from a real platform error — `permanent_lockout` remains a correctly-typed, currently-unreachable member of the taxonomy (the same documented-but-unreachable pattern this app already uses for `SuccessState` on the device-registration screen), not a gap this app invented a workaround for.

`not_supported` vs. `hardware_unavailable`: `not_supported` is decided *before* any native prompt runs (`getCapabilities().hardwareAvailable === false`) — better UX than showing a prompt guaranteed to fail. `hardware_unavailable` is reserved for the platform's own runtime `'not_available'` error, in the rarer case hardware becomes unavailable between the capability check and the prompt itself.

### Biometric assertion (step-up result)

```ts
interface BiometricAssertion {
  assertionToken: string; // expo-crypto randomUUID(), NOT a cryptographic proof
  actionId: string;
}
```

`biometricService.createAssertion(actionId, promptMessage)` calls `authenticate()` and, **only on a real platform success**, mints a fresh random UUID as `assertionToken`. This shape exactly matches the backend's existing `biometricAssertion: { assertionToken, actionId }` request field (`apps/api/src/routes/leave.ts`'s `decisionBodySchema`, `packages/api-spec/openapi.yaml`'s `BiometricAssertion` schema) — verified by reading both directly, not assumed. **This token is not cryptographic proof of anything** — it exists to satisfy the exact shape the backend's own `AssertionPresenceBiometricFreshnessGate` currently checks (a non-empty, action-bound string; see §17 below), and this app makes no claim beyond that. `createAssertion` is the reusable step-up primitive any future sensitive-action screen should call — no screen should ever construct a `BiometricAssertion` itself.

### State model

Deliberately smaller than the states listed in this prompt's own suggestion list, because several are already fully expressed by existing types without needing a dedicated named state:

| Suggested state | How it's actually represented |
|---|---|
| `biometric_available` | `capabilities.hardwareAvailable && capabilities.enrolled` (`canAuthenticate()`, `features/biometric/biometricCapability.ts`) |
| `biometric_enabled` / `biometric_disabled` | `useBiometric().isEnabled` (boolean, from `biometricPreferenceService`) |
| `biometric_required` | Not implemented — no ADR/SDD text makes biometric a *routing* requirement; see Architecture summary above |
| `biometric_in_progress` | `useBiometric().isAuthenticating` (boolean) |
| `biometric_succeeded` | `result.kind === "success"` |
| `biometric_failed` / `_cancelled` / `_locked` / `_not_enrolled` / `_not_supported` / `_hardware_unavailable` / `_error` | All are values of the one `BiometricResultKind` union — one flat taxonomy, not eight separate booleans |

Four distinct concepts, kept explicitly separate per this prompt's own instruction:
1. **Platform capability** — `BiometricCapabilities`, read fresh from the OS, never cached across app launches.
2. **Local user preference** — `biometricPreferenceService`'s one persisted boolean.
3. **Current operation** — `isAuthenticating`, transient React state, never persisted.
4. **Result** — `BiometricResultKind`, transient, describes exactly one completed attempt.

(A fifth concept, **backend authorization state**, is explicitly *not* modeled here at all — it does not exist on the client. See §17.)

### Local enablement

`useBiometric().enable()`: checks capability → checks enrollment → calls `biometricService.authenticate()` with a real prompt → **only on `kind === "success"`** does it call `biometricPreferenceService.setEnabled(true)`. A UI toggle can never mark biometrics enabled by itself — verified by `biometric.test.ts`'s "never produces an assertion when hardware/enrollment checks fail" class of tests (same underlying guard). `disable()` simply clears the preference — no biometric prompt required, no effect on Supabase credentials, trusted-device state, or backend authorization (`biometricPreference.test.ts` confirms disabling removes the stored key entirely rather than writing a `"false"` string).

### Step-up authentication

`useBiometric().stepUp(actionId, promptMessage)` is the one reusable mechanism any sensitive screen should call — it wraps `biometricService.createAssertion` with the hook's standard `isAuthenticating` loading state. Two call sites exist today:

1. **Trusted-device Remove/Replace** (`app/(app)/security/[deviceId].tsx`, this prompt's own addition) — gated behind `isEnabled`: if the user has opted in to biometrics, `handleRemove`/`handleReplace` call `stepUp()` first and only proceed to `revoke()`/`register()` on success; if the user has not opted in, the screen behaves exactly as it did in Prompt 4B (unchanged). This is a **discretionary judgment call this prompt made**, not a literal SDD mandate for this specific screen — reasoned as analogous to the SDD's biometric-gated leave-approval requirement, but deliberately kept optional/opt-in here since no ADR/SDD text requires it for device removal specifically.
2. **A future leave-approval screen** (not built in this prompt — leave business logic is explicitly out of scope) — per SDD Ch.5 §5.2/Ch.6 §6.2, biometric confirmation there is **mandatory, per-action**, not gated behind the local `isEnabled` preference. Whoever builds that screen should call `stepUp(actionId, promptMessage)` unconditionally and attach the resulting `assertion` directly to the `biometricAssertion` field of the approve/reject request body — the shape already matches exactly (see above). **This integration point is documented, not implemented** — no leave-approval code exists anywhere in this app.

### Session re-authentication

**Not implemented, deliberately.** This prompt's own instructions warn against inventing an arbitrary timeout. Repository reconnaissance searched every doc/ADR mentioning "biometric" and found the opposite of a session-idle-timeout model: `docs/auth-database-security-model.md` states biometric confirmation is required **"immediately before the specific action, not once per session"** (citing SDD Ch.5 §5.2, Ch.6 §6.2 explicitly). No configured idle-timeout value, no "returning from background" trigger, and no session-re-authentication requirement of any kind was found anywhere in the accepted architecture. Building an AppState-based foreground/idle-timeout re-auth mechanism here would have been exactly the "invent an undocumented business rule" this prompt forbids — so none exists. `useBiometric().authenticate()` is generic enough that a future prompt could wire one up if a specific trigger condition is ever actually specified, but no automatic trigger is wired today.

### Component inventory

**New:** `BiometricStatusCard` (current enabled/available/methods summary), `BiometricMethodBadge` (one badge per supported method) — both `src/features/biometric/components/`, mirroring the devices feature's own thin-wrapper-around-generic-primitive pattern.

**Reused:** `SecurityInformationCard` (relocated to `components/ui` — see Foundation doc), `Card`, `Badge`, `Button`, `Loader`, `ErrorState` (via `biometricResultMessage`'s plain-text rendering on the Device Details step-up failure path).

**Deliberately not built**, each with a reason:
- **`BiometricPrompt`** — the native OS prompt itself cannot be visually customized or wrapped by this app; building a component with this name would misleadingly imply an in-app modal exists when the platform owns that UI entirely.
- **`RegistrationProgress`/`VerificationLoader`-equivalents** — `authenticateAsync` is a single call with no real intermediate stages to represent; the existing `Loader` plus a plain status line (`"Confirm it's you…"`) is honest and sufficient, matching Prompt 4B's identical reasoning for not building a fake multi-stage registration-progress component.
- **`BiometricErrorState`/`BiometricSuccessState`** — `biometricResultMessage()` already produces rich, per-kind title/description/canRetry/suggestDeviceSettings data; every consuming screen renders it directly (a `SecurityBanner` or a small inline text block) rather than through a new dedicated component wrapping the generic `ErrorState`/`SuccessState` — avoids component proliferation for what would otherwise be a near-single-use wrapper.

### Settings integration

`app/(app)/security/biometric.tsx` — lives under the existing `(app)/security` area (Prompt 4B), not the still-fully-placeholder `(app)/settings` screen, since `(app)/security` **is** this app's existing security-domain screen group (Trusted Devices, Device Details, Security Tips). Registered in `(app)/_layout.tsx`'s `<Stack>` with `headerShown: true, title: "Biometric Authentication"`, matching every sibling route. Reachable from the Trusted Device List's footer ("Biometric authentication" button, alongside the existing "Learn more about device security" link).

### Fallback strategy

| Situation | Behavior |
|---|---|
| User cancels | `user_cancelled` — retryable, no device-settings suggestion |
| Authentication fails (no match) | `authentication_failed` — retryable |
| Temporary lockout | `temporary_lockout` — retryable after a delay; device passcode remains available via the OS's own fallback UI |
| Not enrolled | `not_enrolled` — not retryable in-app; suggests device settings |
| Hardware unsupported | `not_supported` — not retryable, no settings suggestion (nothing to configure) |
| Hardware temporarily unavailable | `hardware_unavailable` — retryable |
| Device credential fallback | Enabled by default (`disableDeviceFallback: false`) — the OS itself offers this after failed biometric attempts; this app does not build a custom passcode-entry UI |
| Network failure | Local biometric authentication requires no network at all (`expo-local-authentication` is fully on-device) — but a step-up success never bypasses a subsequent network-dependent operation's own connectivity requirement. No offline mutation of any kind was added — `stepUp`'s result is only ever a precondition check before an existing, already-network-dependent `revoke()`/`register()` call |
| Session expiry | Unrelated concern, unchanged — Supabase's own session lifecycle (§3) handles this; a biometric step-up never substitutes for OTP re-authentication |

### Security considerations

- **Biometric data**: never stored, never transmitted, never accessible to this app in the first place — `expo-local-authentication` exposes only a `{success, error?}` result, no template/image/vendor payload.
- **OS authentication boundary**: a `{kind: "success"}` result means the device OS authenticated the device owner via an enrolled method. It is never treated as this app cryptographically identifying the user.
- **Trusted-device boundary**: biometric enrollment, biometric enablement, and trusted-device status are three distinct concepts, never conflated. Enabling biometrics never mutates `trusted_devices`; `useDevice`'s `register`/`revoke` remain exactly as fail-closed as Prompt 4B left them. Biometric success is used only as an optional *prerequisite gate* in front of those calls (§ Step-up above), never a replacement for them.
- **Device-attestation boundary (ADR-003)**: unchanged and unaffected — attestation remains entirely unimplemented on the backend (`DeviceAttestationGate`/`NotImplementedAttestationGate`, unwired into any route). Nothing in this prompt claims otherwise, references it as satisfied, or attempts to compensate for its absence.
- **Backend authorization boundary**: unaffected — this app makes no new backend calls at all. `createAssertion`'s output is inert data sitting in a variable until some future screen chooses to attach it to a request; nothing in this prompt sends it anywhere.
- **Biometric-freshness limitation (restated, not resolved)**: `AssertionPresenceBiometricFreshnessGate` (`apps/api/src/lib/auth/security-gates.ts`) only checks that `assertionToken`/`actionId` are non-empty strings — it does not cryptographically verify a real biometric event occurred. This prompt's `assertionToken` is an honest, non-fabricated *local* proof (a real platform success genuinely happened), but sending it to that backend gate today would satisfy only presence, not freshness or authenticity, in any cryptographic sense. This is a **pre-existing, already-documented production blocker** (Prompt 0.6 audit G-03, restated in the Prompt 4B quality-gate review as SEC-002) — Prompt 5 does not resolve it, cannot legitimately resolve it (no backend cryptographic-verification capability exists to integrate with), and does not claim to.

### Offline behavior

Local biometric authentication itself needs no network (fully on-device). No operation this prompt added performs a network call as a *result* of a successful local authentication — `stepUp`'s assertion is inert until a caller attaches it to an already-existing, already-network-dependent request. `revoke()`/`register()` (Device Details' Remove/Replace) remain exactly as they were in Prompt 4B: they fail closed regardless of connectivity, since they always reject today. No offline leave approval or offline trusted-device mutation was introduced.

### Logging policy

`logger.info`: "biometric: authentication requested/succeeded", "biometric: enabled/disabled". `logger.warn`: "biometric: authentication did not succeed" (carries only the mapped `BiometricResultKind`, never a raw platform payload), "biometric: capability check failed", "biometric: cancelAuthentication failed". Never logged: any biometric data (impossible — never received in the first place), the `assertionToken` value itself, or any raw native exception payload beyond the JS `Error` object's own message (matching this app's existing `logger` conventions elsewhere, e.g. `services/supabase/auth.ts`).

### Security-event / audit integration

No backend security-event endpoint exists for the mobile client to call, and none was invented for this prompt — confirmed during reconnaissance (no such route in `apps/api/src/routes`). All "security event" logging this prompt performs is local-only, via the existing `logger` abstraction (above), not sent anywhere. If a backend audit-event ingestion endpoint is ever built, this is the integration point a future prompt would wire up — not built here.

### Testing strategy

62 new tests across 8 files, all pure-logic/service-boundary (no component-rendering test, matching this repo's existing, already-documented Vitest limitation — see §14):

- `services/biometric/biometricErrors.test.ts` (15) — every platform error string → app-level kind, including an explicit assertion that `permanent_lockout` is never produced (the platform library genuinely can't distinguish it).
- `services/biometric/biometric.test.ts` (17) — capability mapping (including fail-closed-on-throw), `authenticate()`'s pre-flight capability short-circuit (never calls the native prompt when unsupported/not-enrolled), the `strong`/`disableDeviceFallback:false` options actually sent to the platform call, `createAssertion`'s security boundary (never produces an assertion on anything but real success; each assertion gets a distinct token), `cancelAuthentication`'s Android-only behavior.
- `services/biometric/biometricPreference.test.ts` (4) — persistence round-trip, safe default (`false` when nothing stored), disable clears the key entirely.
- `features/biometric/biometricCapability.test.ts` (10), `biometricMessages.test.ts` (14), `biometricContent.test.ts` (2) — display/messaging correctness plus explicit content-scan assertions that no message anywhere claims "DigiHostel verified your fingerprint" or equivalent.

Regression: the full pre-existing suite (269 tests before this prompt) plus Prompt 4B's own 24 were re-run unmodified and unweakened — final count 331 passed, 26 skipped, zero regressions.

### Native verification status

**Not performed this session.** No Android emulator or physical device was connected to this environment at implementation time (`adb devices` returned an empty list). This is not a new problem: the immediately preceding sessions (Prompt 4A/4B native-verification work) exhaustively diagnosed that this specific sandboxed environment's Android emulator has no outbound network egress at all, and that Expo Go's own client independently fails an internal "check for updates" step on the one real USB device previously tested — both causes unrelated to any app code, both already fully documented in this file's §14 addendum. Re-running that same multi-hour diagnosis here, with no device even connected, would not have produced new information. What stands in its place: full typecheck/lint/format, the automated test suite above, a full workspace build, `expo-doctor` (18/18), `expo config --type public` (confirmed the `expo-local-authentication` plugin and `faceIDPermission` string are correctly present in the resolved config), and a full production `expo export` (zero errors, 1147 modules). No claim of actual on-device Face ID/Touch ID/fingerprint verification is made anywhere in this document.

### Remaining production limitations

- **Biometric-freshness cryptographic verification** (backend) — remains an explicitly non-cryptographic placeholder; the single most important pre-existing production blocker this prompt's own boundary rules forbid it from resolving.
- **Device attestation** (ADR-003, backend) — remains entirely unimplemented; unrelated to and unaffected by this prompt.
- **Leave-approval screen integration** — the `stepUp()`/`BiometricAssertion` integration point is fully built and documented above, but no leave-approval UI exists yet to actually call it.
- **Session/idle-timeout re-authentication** — not implemented; no documented trigger condition was found to implement against (see Session re-authentication above).
- **Native/on-device verification** — not performed this session; see Native verification status above.

## 17. Trusted Device Security Center (Prompt 6)

### Architecture summary

```
app/(app)/security/
  index.tsx        Security Center Home — dashboard (Prompt 6, new content
                    at this route; the route itself already existed)
  devices.tsx       Trusted Devices List (Prompt 4B's content, relocated
                    here from security/index.tsx)
  [deviceId].tsx    Device Details (Prompt 4B; extended Prompt 5 with
                    biometric step-up, extended Prompt 6 with an Activity
                    section)
  tips.tsx          Security Tips (Prompt 4B, unchanged)
  biometric.tsx     Biometric Settings (Prompt 5, unchanged)
```

**Route relocation, not a new architecture:** `/(app)/security` previously served the Trusted Devices List directly (Prompt 4B). This prompt's own screen inventory names "Security Center Home" and "Trusted Devices List" as two distinct items, so the list's UI moved to its own route (`security/devices.tsx`, content unchanged) and the group's entry point (`security/index.tsx`) became a genuine dashboard. Nothing outside the `security/` folder referenced `/(app)/security` by path before this change (verified by grep) — no other screen's navigation needed updating. `AuthGate`/`routeGuard.ts` were not touched; neither ever referenced this route (only `/(app)/(tabs)` is `routeGuard.ts`'s entry point for `authenticated` status) — this relocation carries zero route-protection risk.

### Screen hierarchy & navigation

```
AuthGate → (app)/(tabs) [unchanged entry point]
  ... user navigates to Security Center from wherever a future
  Profile/Settings link is added (none exists yet — Profile remains a
  Prompt-2 placeholder, out of this prompt's scope) ...

(app)/security/index (Security Center Home)
  → "Trusted devices (N)"        → (app)/security/devices
  → "Biometric authentication"   → (app)/security/biometric
  → "Security tips"              → (app)/security/tips
  → a Recommendation card's own action → whichever of the three above
    its `actionTarget` names

(app)/security/devices (Trusted Devices List)
  → tap a DeviceCard → (app)/security/[deviceId]
  → footer links → biometric.tsx / tips.tsx (unchanged from Prompt 4B/5)

(app)/security/[deviceId] (Device Details)
  → Remove/Replace panels (Prompt 4B/5, unchanged mechanics)
  → Activity section (Prompt 6, new — see below)
```

### Device data source & current-device identification

No second device-identity mechanism was introduced. `CurrentDeviceBanner` (`features/devices/components/`) reuses the exact same `deviceIdentityService` Prompt 3 already established, reading only `getMetadata()`'s `platform` field — never the raw installation UUID. Trust state for "this device" is cross-referenced from the same `TrustedDeviceSummary[]` list every other screen already has (`isCurrentDevice`, computed in `devices.ts` by comparing `device_fingerprint` to the installation id — Prompt 4B, unchanged). Two distinct facts are always kept visually and textually separate, per this prompt's own instruction: **"This device"** (a local, always-true fact about which physical device you're using) is shown as an eyebrow label, while **"trusted" vs. "Not verified"** (a backend-derived fact, read from `devices`) is shown as a separate badge/text alongside it — the banner never merges these into one claim.

### Service boundaries

**No new service class was created.** `DeviceManagementService`/`SecurityCenterService`/`DeviceActivityService`/`RecommendationService` were all considered and rejected as unnecessary indirection: `deviceService` and `biometricService` already own every actual responsibility that exists (device reads/writes, biometric capability/authentication) — a "SecurityCenterService" wrapping calls to both would be exactly the "wrapper that merely renames existing functions" this prompt's own instructions forbid. The one genuinely new responsibility — deriving recommendations/protection-status *from* that existing state — is pure, presentation-adjacent logic, not a service boundary, so it lives in `features/security/` (see State Management below), consistent with how `features/devices/deviceStatus.ts` already handles device-status derivation.

### State management additions

`useDevice()` was migrated from a plain `useState`-based hook to `useQuery`/`useMutation` (TanStack Query) — see the Foundation doc's §8 update for the rationale (fixes Prompt 4B's own flagged PERF-001 finding: independent per-screen re-fetching, no shared cache). Its **public shape is unchanged** — every existing call site (`(onboarding)/devices.tsx`, `security/[deviceId].tsx`) continues to work without modification; only `security/devices.tsx` (relocated) and the new `security/index.tsx` additionally use the new `isRefreshing` field (TanStack Query's own `isFetching`-while-already-loaded state, replacing each screen's former hand-rolled `isRefreshing` boolean).

New pure state/derivation modules — none touch `AuthContext`/`SessionContext`/`authStatus`/`AuthGate`/`routeGuard`/biometric authentication state/trusted-device authority, all of which remain exactly as Prompts 3/4B/5 left them:
- `features/security/securityStatus.ts` — `deriveProtectionSummary()`, a pure function combining the already-fetched device list's active-trusted-device fact with `useBiometric()`'s already-tracked `isEnabled` preference. No new backend call.
- `features/security/securityRecommendations.ts` — `deriveSecurityRecommendations()`, same inputs plus biometric *capability* (`canAuthenticate()`, Prompt 5).
- `features/devices/deviceFilters.ts` — pure client-side filter/sort, prepared but not wired into a UI (see below).
- `features/devices/deviceActivity.ts` — the honest "unavailable" copy for the Activity section (see below).

### Activity data source — confirmed unavailable, not merely unbuilt

Repository reconnaissance (this prompt's own mandatory first step) checked every table that could plausibly back a device activity feed:

| Table | Client read access? | Would it fit? |
|---|---|---|
| `audit_logs` | **No** — zero RLS policies for the `authenticated` role exist at all (`packages/db/src/schema/audit.ts`'s own comment: "Deliberately NO policies at all for any client role... Only Fastify's service-role connection... reads/writes this table"). Confirmed by reading the actual migration SQL, not assumed. | Would have been the right table (generic actor/action/entity model), but the mobile client is architecturally forbidden from reading it. |
| `device_attestation_events` | Yes (`dae_select_own`) | No — records only attestation pass/fail checks, not the general event types (registered, biometric enabled, replaced, session restored, etc.) this feature implies, and since ADR-003 attestation is unimplemented, nothing has ever written a row to it either. |

Conclusion, stated exactly in `deviceActivity.ts`'s own doc comment: **no backend data source exists that this app can honestly present as "device activity."** The Activity section on Device Details therefore shows a fixed, honest "Activity history isn't available yet" message — not a fabricated event list, not a misleadingly-real-but-permanently-empty query against the wrong table. This is a confirmed absence, not an oversight.

### Security status model

`deriveProtectionSummary()` returns one of three qualitative outcomes — never a number:
- **"Attention needed"** (warning) — no active trusted device.
- **"Basic protection active"** (neutral) — trusted device exists, biometric off.
- **"Protection checks in place"** (success) — trusted device exists AND biometric on.

No accepted ADR/SDD defines a security-score calculation, and this prompt's own instructions explicitly forbid inventing one — `securityStatus.test.ts` asserts none of the three outcomes ever contains "completely secure," "fully secure," or a percentage. `SecurityStatusCard` renders the label and description as text (a colored left accent mirrors `SecurityBanner`'s existing style, but is never the only signal).

### Recommendation model

Three rules, all evaluated against state this app already has authoritatively — no recommendation implies a backend check that doesn't exist:
1. Biometric capable but not enabled → suggests enabling it (`biometric-settings`).
2. Zero active trusted devices → suggests verifying one (`security-tips`, since `(onboarding)/devices` is unreachable once already `authenticated` — same navigation-architecture constraint documented in §15).
3. At least one revoked device on record → suggests reviewing the device list (`devices-list`).

Structured for extension: `Recommendation` is a flat `{id, title, description, actionLabel, actionTarget}` — a future backend-driven recommendation could be merged into the same array `RecommendationCard` renders, without any UI change.

### Search/filter/sort

`features/devices/deviceFilters.ts` implements `filterDevices()`/`sortDevices()` (status/platform filters, three sort orders) as pure, tested functions — **deliberately not wired into any screen's UI**. The backend has no server-side query/filter support to integrate with (a raw RLS-scoped `select`), and the realistic device count per parent today is small enough that a search/filter UI would be the "unnecessary complexity" this prompt's own instructions warn against building prematurely. The prepared logic is real and tested, ready for a future screen to compose.

### Offline behavior

Unchanged from Prompt 4B/5's own fail-closed posture — no new offline mutation path was added. `useDevice()`'s TanStack Query cache means a screen can render its *last successfully fetched* device list while offline (standard `useQuery` behavior — stale data remains in `data` while a background refetch fails), which is itself a form of "stale, not current" presentation; no explicit "this data may be stale" banner was added in this pass, since `NetworkContext` (Prompt 2) still has no real connectivity detector wired up (documented, pre-existing limitation — see `NetworkContext.tsx`'s own doc comment) and this prompt's own instructions warn against inventing a network-status signal that doesn't exist. Destructive operations (`revoke`/`register`) remain exactly as fail-closed as before regardless of connectivity — they always reject today, and TanStack Query's default mutation `retry: false` (set globally in `lib/queryClient.ts` since Prompt 2, unchanged) ensures no silent retry-when-reconnected behavior was introduced.

### Error handling

Unchanged taxonomy (`types/errors.ts`, `mapDeviceError`) — no new `AppErrorKind` was needed for this prompt. `TrustedDevicesList`/`SecurityCenterHome` both route query errors through the existing `toAppError`/`ErrorState` pattern; TanStack Query's own `error` field is mapped via the same `toAppError()` every other screen already uses.

### Accessibility

No new accessibility pattern was introduced — every new component (`SecurityStatusCard`, `RecommendationCard`, `CurrentDeviceBanner`) follows the established conventions exactly: text always carries the meaning color also conveys, `Button`'s existing 44pt/role/hint handling, `PageHeader`'s `accessibilityRole="header"`. **Not verified against an actual screen reader or device this session** — see Native verification status below.

### Backend capability dependencies (this prompt's own required classification)

| Capability | Status |
|---|---|
| Trusted-device list read (active + revoked) | **Available today** — real, RLS-scoped |
| Current-device identification | **Available today** — real, derived from `device_fingerprint` comparison |
| Biometric capability/enablement | **Available today** — real, `expo-local-authentication` (Prompt 5) |
| Device registration | **Unavailable** — fail-closed, blocked on ADR-003 attestation (unchanged from Prompt 4B) |
| Device revocation/removal | **Unavailable** — fail-closed, no backend endpoint (unchanged from Prompt 4B) |
| Device activity/audit feed | **Unavailable** — confirmed via RLS inspection this prompt (`audit_logs` has zero client policies); not merely unbuilt |
| Numeric/authoritative security score | **Not applicable** — no ADR/SDD defines one; a qualitative summary was built instead, by design |
| Server-side device search/filter | **Unavailable** — client-side filtering prepared instead (see above) |
| Biometric-freshness cryptographic verification (leave approval) | **Production blocker**, pre-existing, unrelated to and unaffected by this prompt (§16) |

### Native verification status

**Not performed this session.** No Android emulator or physical device was connected (`adb devices` returned an empty list) — the same environment characteristic already exhaustively diagnosed across the Prompt 4A/4B/5 sessions (this sandbox's emulator has no outbound network egress; Expo Go independently fails its own "check for updates" step on the one real device previously tested). What stands in its place: full typecheck/lint/format, the automated test suite (24 new tests this prompt), a full workspace build, `expo-doctor` (18/18), and a full production `expo export` (zero errors, 1154 modules) — including a real regeneration of Expo Router's typed-route declarations (confirmed `security/devices` present in `.expo/types/router.d.ts` before the final typecheck pass, not merely assumed).

### Future extension points

- If a backend security-event/audit endpoint is ever exposed to parents, `deviceActivity.ts`'s honest-unavailable copy is the single place to replace with a real query — no screen structure needs to change (the Activity section already exists on Device Details).
- If a real device-count grows large enough to matter, `deviceFilters.ts`'s pure functions are ready for a search/filter UI without touching the underlying data layer.
- If a backend-computed security score or additional recommendation source is ever added, `Recommendation`'s flat shape absorbs it without a `RecommendationCard` redesign.
