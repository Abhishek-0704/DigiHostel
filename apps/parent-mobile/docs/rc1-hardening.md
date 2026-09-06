# Parent Mobile Application — Testing, Optimization & Release Hardening (Prompt 12 / RC1)

This document covers Phase 5 Prompt 12: a release-hardening pass over the already feature-complete Parent + Guardian Application (Authentication through Profile/Settings — Prompts 1–11). No new product feature was added. Every change below is a demonstrated defect fix, a reliability/security hardening change, or test-coverage/documentation cleanup. See the root `docs/current-state.md` for the backend-wide verified baseline this pass builds on.

## 1. Method

Four parallel, evidence-based investigations were run (realtime/offline/query state, security/auth/storage, code quality/dead code, accessibility/UI consistency), each required to cite file:line evidence and a concrete failure scenario for every finding, never a generic "could be an issue." Findings were triaged: fixed if they were a genuine defect with a minimal, non-speculative fix; documented as an accepted/deferred limitation if fixing them would mean a new feature, a redesign, or an unverifiable change in an environment with no live Supabase/device available.

## 2. Bugs Fixed — Functional / Data Correctness

**BLOCKER — "Pending Approval" and the Dashboard's pending count included already-decided requests.** `usePendingApprovals()` (`src/features/leave-approval/hooks/usePendingApprovals.ts`) wrapped the real, backend-integrated `approvalService.listForCurrentParent()` (Prompt 9B) but never filtered its result — that call returns every leave request for every linked student, in every status, not only decidable ones. A parent with any approval history would see the Dashboard's `PendingActionsCard` claim "N leave requests awaiting your response" for N = lifetime total, and the Pending Approval list — whose own empty-state text says "Leave requests awaiting your response will appear here" — would show approved/rejected/expired requests. A stale doc comment ("pendingCount is simply the length of whatever the service returned — 0 today, since the query never succeeds") was accurate in Prompt 9A (before the backend existed) and was never updated when Prompt 9B wired the real call. **Fix:** extracted a pure `filterAwaitingResponse()` (`src/features/leave-approval/leavePresentationMapper.ts`) — the same filter `useLinkedStudents.ts` already applied independently to the same raw feed — and applied it in `usePendingApprovals()`. Regression coverage: 2 new tests in `leavePresentationMapper.test.ts`.

**MEDIUM — a decision made from the Leave Details screen did not invalidate the Approval History cache.** `useDecideLeaveRequest`'s mutation success path invalidated the pending-list and detail-query keys but not `APPROVAL_HISTORY_QUERY_KEY`, which reads the same underlying call under its own cache entry. If the History tab wasn't mounted (no live realtime subscription) when a decision was made elsewhere, it could show the pre-decision status until its 30s `staleTime` expired. **Fix:** added the missing `queryClient.invalidateQueries({ queryKey: APPROVAL_HISTORY_QUERY_KEY })` call.

## 3. Bugs Fixed — Realtime / Offline / Reliability

**HIGH — a realtime reconnect never triggered a catch-up refetch.** `useLeaveRequestRealtime`/`useNotificationRealtime` only called the caller's `onChange` from inside a `postgres_changes` payload handler; the channel's own status callback (`SUBSCRIBED`/`CHANNEL_ERROR`/`CLOSED`) only updated local UI state. Postgres Changes never replays events missed while disconnected, so a parent whose socket briefly dropped (backgrounded app, cell handoff) and reconnected would keep showing stale data until an unrelated remount or manual pull-to-refresh. **Fix:** both hooks now track whether they have already reached "connected" once; a later `SUBSCRIBED` transition (a genuine reconnect, not the initial connect the mount's own fetch already covers) now triggers a real refetch via the existing `onChange` callback.

**HIGH — TanStack Query's `onlineManager` was never bound to real connectivity.** No file called `onlineManager.setEventListener`, so the library fell back to its browser-only `navigator.onLine` default, which does not exist in React Native — a query that failed while offline was never automatically resumed on reconnect. **Fix:** `src/lib/queryClient.ts` now binds `onlineManager` to `@react-native-community/netinfo` (the standard TanStack Query React Native integration recipe), registered once, globally. This governs only ordinary query retry/resume behavior — it is intentionally independent of, and looser than, `NetworkContext`'s own stricter online/offline/unknown derivation (`src/contexts/networkStatus.ts`), which additionally requires confirmed internet reachability before gating the leave-decision mutation, and remains the sole authority for that gate.

**MEDIUM — `NetworkContext`'s own online/offline derivation contradicted its own documented invariant.** The doc comment stated `isInternetReachable === null` (NetInfo still probing) must be treated as `"unknown"`, "never optimistically online" — but the code fell through to `"online"` for that case. Untested (no existing test file touched `NetworkContext` at all). **Fix:** extracted the pure derivation into a new `src/contexts/networkStatus.ts` (no React Native import, so it can actually be unit-tested under this workspace's plain-Node vitest environment — mirroring the `leaveDecisionReconciliation.ts` pattern) and corrected the `null` case to return `"unknown"`. 5 new regression tests (`networkStatus.test.ts`).

**LOW — a double-tap on the leave-decision confirmation button had no reentrancy guard.** `ConfirmationPanel` already exposes a `disabled` prop, correctly wired by Account's Logout confirmation, but `leave/[id].tsx`'s Approve/Reject confirmations never passed it — and the hook's own `isProcessing` flag was computed but never read. In practice `handleConfirmDecision` transitions `uiState` away from `"confirming_*"` before its first `await`, which unmounts the button on the same render pass, but two taps landing before that re-render commits could still both fire. **Fix:** added a synchronous `useRef` reentrancy guard (`submittingRef`) that rejects a second call immediately, regardless of render timing — closes the race deterministically rather than relying on render-order luck.

**LOW — four unhandled-promise-rejection sites.** `ThemeContext.tsx`, `useReducedMotion.ts`, `CurrentDeviceBanner.tsx`, and `useNotificationDeepLinkRouting.ts` each called `.then()` on a native API (`secureStorage`, `AccessibilityInfo`, `deviceIdentityService`, `expo-notifications`) with no `.catch()`. None of these currently reject often, but each would surface as an unhandled-rejection warning if the underlying native call ever threw. **Fix:** added a `.catch()` to each — three silent (the existing UI already handles the "still null/default" state correctly) and one routed through the existing `logger.warn`.

## 4. Security Fixes

**HIGH — a biometric step-up assertion was not bound to the specific leave request it was captured for, and was replayable.** `LeaveService.decide()` (`apps/api/src/domain/leave/service.ts`) called `biometricGate.checkFreshness({assertionToken, actionId})` but never compared `actionId` against the leave request actually being decided. `AssertionPresenceBiometricFreshnessGate` only checks that both fields are non-empty strings — it never persists `assertionToken`, so the same captured assertion could be replayed against a different leave request's approve/reject endpoint. The client's own convention (`leave-decision:${leaveRequestId}`, `app/(app)/leave/[id].tsx`) already assumes this binding is enforced server-side; nothing did. This is a gap beyond the already-documented "non-cryptographic placeholder" limitation — even an honest placeholder should enforce that the assertion claims to be for the right action. **Fix:** `LeaveService.decide()` now rejects the decision (with the same safe `LeaveBiometricConfirmationError` a stale assertion already produces) unless `biometricAssertion.actionId === \`leave-decision:${leaveRequestId}\``. This is a pure string comparison of two caller-supplied values — it never touches the database, so it introduces no new enumeration signal. Test fixtures (`routes/leave.test.ts`, `plugins/rateLimit.test.ts`) updated to send a realistically-bound `actionId`; `service.test.ts` and `repository.integration.test.ts` needed no changes (already consistent, or exercise the repository directly, bypassing the service-layer check).

**MEDIUM — the API registered `@fastify/cors` with no options, defaulting to a wildcard `Access-Control-Allow-Origin: *` on every route.** No browser-based client exists for this API (the mobile apps call it directly, and auth is bearer-token, not cookie-based), so this was an unnecessary "secure by default" gap rather than an active exploit path. **Fix:** `apps/api/src/app.ts` now registers `cors` with `{ origin: false }` explicitly, rather than relying on the plugin's own default.

**MEDIUM — demonstration/test-only auth routes (`GET /_internal/whoami`, `GET /_internal/staff-only`) were registered unconditionally, including in a production build.** These exist to demonstrate the authentication boundary (not product API surface — no OpenAPI entry) and return only the caller's own id/role, but were reachable in any deployment as an ungated authenticated-token-validity oracle. **Fix:** gated their registration behind `process.env.NODE_ENV !== "production"` in `apps/api/src/app.ts`, the same pattern `lib/logger.ts` already uses for its own dev-only transport. `NODE_ENV` is unset/`"test"` during `pnpm test`, so existing tests are unaffected.

**LOW — one error mapper deviated from this app's "never derive the user-facing message from a raw error" convention.** `mapNotificationError` (`src/features/notifications/notificationErrors.ts`) passed `err.message` through directly for `NotificationActionNotSupportedError` — currently harmless (that error's message is itself a hardcoded safe string) but inconsistent with every sibling mapper's use of `safeMessageFor(...)`. **Fix:** switched to `safeMessageFor("notification_action_unavailable")`, matching the established taxonomy pattern, so a future change to that error type cannot accidentally start leaking internal detail through this path.

### Security finding NOT fixed — new discovered production blocker

**HIGH — unauthenticated SMS-OTP triggering, with no pre-check and no effective rate limiting.** `login.tsx` calls `sendOtp()` (`services/supabase/auth.ts`, which calls Supabase Auth's `signInWithOtp` directly) for any syntactically-valid phone number, with no server-side check that the number belongs to a registered parent — exactly the gap ADR-020 already named and explicitly deferred ("a new Fastify pre-check endpoint is still required... not yet built"). The only throttle is a 30-second **client-side** React state cooldown in `otp.tsx`, which is not persisted and is not a security control (trivially bypassed by restarting the app or calling Supabase's REST endpoint directly). ADR-020 anticipated this as a known future dependency when it was accepted; what changed is that the Login/OTP UI (commit `c8a8fc1`) has now actually been wired up ahead of that pre-check existing, so the SMS-cost-abuse/harassment vector this ADR flagged is now live in the running app, not merely a documented future gap.

**This was deliberately NOT fixed in this pass.** Building the real fix — a roll-number/phone-to-parent-record pre-check endpoint — is new backend business logic and a new API route, which Prompt 12's own `<critical_scope>` explicitly prohibits ("DO NOT add new product features," "DO NOT fabricate backend support"). No mitigation exists on the client side alone that would be more than cosmetic. Recorded here, and in the risk register below, as a genuine, newly-discovered pre-pilot blocker requiring an explicit, separately-scoped task — not silently reinterpreted as solved, and not patched with a shortcut that would look fixed without being fixed.

## 5. Code-Quality Fixes

**HIGH — the canonical "is this device active/trusted" predicate (`getDeviceTrustState`, `src/features/devices/deviceStatus.ts`) was bypassed by 6 independent hand-rolled `device.revokedAt === null` checks** across `securityRecommendations.ts`, `SecurityStatusSection.tsx`, `deviceFilters.ts`, `settings/security.tsx`, `security/index.tsx`, and `(tabs)/profile.tsx`. A future change to trust-state rules (e.g. adding a "suspended" state) would have silently missed 6 of 7 call sites. **Fix:** every call site now imports and uses `getDeviceTrustState()`.

**MEDIUM — `withRetry`/`delay` (`src/utils/async.ts`) were 100% dead code** (zero real callers — only their own test file), and `lib/queryClient.ts`'s own comment claimed "each feature that needs retry opts in explicitly via `withRetry`," which was misleading: no feature did. **Fix:** removed `async.ts` and its test file (4 tests), removed the barrel re-export, and corrected the misleading comment.

**LOW — `notificationErrors.ts` message-derivation convention** — covered under Security Fixes above (same fix serves both purposes).

### Code-quality findings documented but not fixed (low value / high blast radius for a hardening pass)

- ~24 barrel `index.ts` files across `services/*`/`features/*`/`components/*` have zero importers anywhere in the app (every real consumer imports the concrete file path instead). Genuinely dead but harmless; left as a LOW cleanup candidate rather than a 24-file sweep in this pass.
- `formatDeviceDate`/`formatLeaveDate`/notification date formatting and their `MONTH_NAMES` arrays are byte-identical across three features — each file's own doc comment shows this was a conscious per-feature choice, not an oversight. Left as-is (no measurable benefit demonstrated for a shared-utility extraction).
- `PlaceholderScreen`, `ScrollContainer` (dead, zero usages) and `DeviceInfoSection`'s now-unnecessary `@deprecated` alias — left as LOW cleanup candidates.
- `expo-linking` appears to be an unused dependency (`package.json`) — left for a dedicated dependency-audit pass rather than removed here without re-verifying against native build config.

## 6. Accessibility Fixes

**MEDIUM — confirmation dialogs never announced their appearance to a screen reader.** `accessibilityRole="alert"` on a plain `View` (`ConfirmationPanel.tsx`) is not reliably announced by VoiceOver/TalkBack the way `role="alert"` is on the web. Since this component gates security-sensitive actions (approve/reject a leave request, sign out), a screen-reader user might not realize a confirmation appeared. **Fix:** `ConfirmationPanel` now calls `AccessibilityInfo.announceForAccessibility()` once per mount with the title and bullet text.

**LOW — the root `ErrorBoundary`'s fallback text color had no guaranteed background.** Its fallback message hardcodes a dark, theme-independent text color (deliberately — it must survive even a provider crash), but its container set no `backgroundColor`, risking near-invisible text if whatever renders behind it happens to be dark. **Fix:** pinned an explicit `backgroundColor: "#FFFFFF"` alongside the existing hardcoded text color.

### Accessibility findings documented but not fixed

- `DetailRow`'s side-by-side, right-aligned layout is reused for the Leave Reason field's free-text, unbounded-length content — a rough edge (not a clipping bug) at large accessibility text sizes, since every other `DetailRow` usage is a short fixed-format string. Left as a LOW, targeted future fix (a stacked layout for that one field) rather than changed here, since it requires distinguishing usages rather than fixing the shared component.
- Several screens (`otp.tsx`, `welcome.tsx`, `login.tsx`, `devices.tsx`, `security/[deviceId].tsx`, `security/biometric.tsx`, `leave/[id].tsx`) use raw pixel literals instead of `theme.spacing.*` tokens. Colors are unaffected (dark mode is not at risk), and no raw hex color was found anywhere outside `styles/tokens.ts`. Left as a LOW/INFORMATIONAL cleanup item.
- Touch targets (44pt on every interactive primitive), color-only status communication (none found — every `Badge` pairs tone with text), and reduced-motion handling (`useReducedMotion`, correctly gating the app's one `Animated` usage) were all reviewed and found correct — no fix needed.

**Native screen-reader/VoiceOver/TalkBack verification was not performed** — no device or emulator is available in this environment (unchanged limitation from every prior prompt). All accessibility findings above are from static code review only.

## 7. Verification Performed (this pass)

| Check | Result |
|---|---|
| `pnpm run typecheck` (workspace) | Clean, 0 errors — run 3 times across this pass as fixes landed |
| `pnpm run lint` (workspace, ESLint) | Clean, 0 errors/warnings |
| `pnpm run format` (Prettier `--check`) | Clean (4 files needed `--write` once, mid-pass; clean after) |
| `pnpm run test` (workspace, Vitest) | **576 passed, 28 skipped, 66 files passed + 2 skipped (68 total)** — up from the pre-pass baseline of 573/28/66, net +7 new tests (+11 added: 5 `networkStatus`, 2 `filterAwaitingResponse`; −4 removed: dead `async.test.ts`), zero regressions |
| `pnpm run build` (workspace + runtime-resolution verification) | Clean |
| `npx expo export --platform android` | Clean — 3.78 MB Android bundle, temp export directory removed after |
| `npx expo-doctor` | **18/18 checks passed** |
| `supabase test db` (pgTAP) / live-Supabase integration tests | **ENVIRONMENT BLOCKED** — `supabase`/`docker` CLIs are present, but the Docker daemon is not running in this environment (`docker ps` fails to connect). Starting Docker Desktop and a full local Supabase stack was judged out of scope for a verification step (slow, environment-modifying, and every prior prompt in this project has independently hit the same limitation) — not attempted. The 22 `repository.integration.test.ts` and 6 `devices.integration.test.ts` tests remain env-gated-skip, unchanged by this pass. |
| Native/device verification | **NOT PERFORMED** — no emulator/device available (unchanged environment limitation) |

No test was deleted, weakened, or had its assertions loosened to pass. Every test-fixture change in this pass (`routes/leave.test.ts`, `plugins/rateLimit.test.ts`) exists solely to keep a fixture's `biometricAssertion.actionId` realistic against the new server-side binding check — none relaxed what the test actually verifies.

## 8. Known Production Blockers (tracked, not solved here)

Carried forward, unchanged:
- ADR-003 device attestation — not implemented.
- Backend cryptographic biometric verification — remains the documented `AssertionPresenceBiometricFreshnessGate` placeholder (now correctly action-bound, per §4 above, but still not cryptographic).
- No real Expo push tokens / production push delivery.
- Notification worker's claim→send→reschedule sequence is not transactionally atomic (Prompt 0.6 audit, G-07).

**New in this pass:**
- Unauthenticated SMS-OTP triggering with no pre-check/effective server-side rate limiting (§4 above) — HIGH, pre-pilot priority.

## 9. RC1 Assessment

This pass fixed one BLOCKER (pending-count correctness), one HIGH functional-reliability pair (realtime reconnect + query resume), one HIGH security gap (biometric action binding), several MEDIUM correctness/security/code-quality issues, and a handful of LOW hardening items — all verified with before/after test evidence, zero regressions. It also surfaced one new HIGH-severity, unresolved security gap (OTP pre-check) that requires its own scoped task before a public pilot, and confirmed (rather than assumed) that the leave-approval concurrency/race-resolution model, the backend authorization guards, and the offline-blocking behavior for the leave-decision mutation are all already correct by direct code inspection — no changes were needed there.

See the conversation's final report for the full 23-section RC1 decision, production-readiness checklist, and risk register.
