# Parent Mobile Application — Leave Approval UI & User Experience (Prompt 9A; Backend Integration Prompt 9B)

This document originally covered Prompt 9A (presentation only). **Prompt 9B ("Leave Approval Backend Integration & Business Logic") has now connected the real workflow** — see §16 for exactly what changed and how. §1's capability matrix below is left as Prompt 9A originally wrote it (a historical record of what was true then); §16 is the authoritative statement of current reality where the two differ.

## 1. Leave Capability Matrix

Established by direct inspection (`packages/db/src/schema/leave.ts`, `apps/api/src/routes/leave.ts`, `apps/api/src/domain/leave/types.ts`, `packages/api-client-react`'s generated client, `docs/leave-approval-workflow.md`) before any UI code was written.

| Capability | Status | Evidence |
|---|---|---|
| Leave request retrieval (list/get) | **IMPLEMENTED (backend)** — real, verified, parent-scoped (`GET /leave-requests`, `GET /leave-requests/{id}`) | Not called in this prompt — presentation-only scope; wiring is Prompt 9B |
| Leave details (reason, dates, status) | **IMPLEMENTED (backend)**, fields limited to exactly `{id, studentId, reason, startDate, endDate, status, createdAt, updatedAt}` | `apps/api/src/domain/leave/types.ts`'s `LeaveRequestView`; `serialize()` in `routes/leave.ts` never returns more |
| Leave type | **NOT APPLICABLE** | No `leave_type` column; no SDD/ADR text defines one (`docs/leave-approval-workflow.md`) |
| Destination | **NOT APPLICABLE** | No column; explicitly confirmed absent by a prior task's own note (`docs/leave-approval-workflow.md` line 79) |
| Expiry timestamp | **MISSING** | No such field anywhere in the schema or API response — escalation deadlines are computed/used internally by the scheduler (`apps/api/src/config/escalation.ts`) but never exposed to a client |
| Academic approval | **NOT APPLICABLE** | No `staffRole` value, no `approvalEventType` value, no SDD/ADR text represents this concept at all |
| Reception verification | **NOT APPLICABLE** | Same — no schema/enum representation; `manual_verification` is an escalation *stage*, not a "verification" event type |
| Student information (name, roll no., hostel, room) | **DEFERRED (genuinely achievable, not built)** | `students_select_linked_parent` RLS policy (`packages/db/src/schema/identity.ts`) really does let a linked parent read this directly, and `hostels`/`rooms` are openly readable — but writing that Supabase query is explicitly out of this presentation-only prompt's scope (`Forbidden: Supabase queries`) |
| Approval history / timeline | **MISSING (rich), MINIMAL (derived)** | `leave_approval_events` is real but insert-only/immutable and reading it is out of scope here; this prompt derives only a 2–3-step timeline from `status`+`createdAt`, never the real event log |
| Parent relationship (father/mother/guardian) | **NOT SURFACED** | Real in `parent_student_relationships.relationship_type`, but never exposed to this app — exposing it would reveal escalation-relevant detail |
| Biometric verification | **NOT INVOKED** | `useBiometric()` is real (Prompt 5) but this prompt never calls it — Prompt 9B's job |
| Trusted-device verification | **NOT INVOKED** | `useDevice()` is real (Prompt 3/6) but this prompt never calls it for authorization purposes |
| Notification entry | **IMPLEMENTED (boundary)** | `resolveNotificationDeepLink()` (Prompt 8) already targets `leave/[id]` — reused unchanged |
| Realtime state | **NOT IMPLEMENTED** | No subscription of any kind added in this prompt |
| Mutation endpoints (approve/reject) | **IMPLEMENTED (backend)**, **NOT CALLED (client)** | `POST /leave-requests/{id}/approve|reject` are real, biometric+trusted-device-gated; `approvalService.approve()/reject()` remain fail-closed placeholders |

## 2. Screen Hierarchy

```
(app)/leave/index      Pending Approval  — list, real service shape, honest "unavailable" today
(app)/leave/[id]        Leave Details     — full presentation state machine (see §4)
```

State-driven presentation is used throughout — no separate route exists for confirmation, processing, or success; all are `uiState` values rendered by the one `leave/[id]` screen, per this prompt's own "prefer a small number of stable screens" instruction.

## 3. Navigation Flow

```
Notification (Prompt 8, leave_approval type) ─┐
                                                ├──▶ (app)/leave/[id]  ──▶ Approve/Reject ──▶ Confirmation ──▶ Prompt 9B
Dashboard Pending Actions / Quick Action ──────┘         ▲
                                                          │
(app)/leave/index (Pending Approval) ────────────────────┘
```

- **Notification entry**: unchanged from Prompt 8 — `resolveNotificationDeepLink()` already resolves a `leave_approval`-typed payload to `{pathname: "/(app)/leave/[id]", params: {id}}`. No push today carries that payload (`docs/notifications.md` §1), so this remains a real, correct, but not-yet-exercised boundary.
- **Dashboard entry**: `PendingActionsCard`'s existing "unavailable" `EmptyState` now has a real `actionLabel`/`onAction` navigating to `/(app)/leave` — still no fabricated count. A new Quick Action ("Leave requests") was added to `dashboardQuickActions.ts`.
- Both destinations remain inside the `(app)` group — `AuthGate` (unchanged) still governs reachability exactly as it does for every other screen.

## 4. Presentation State Model

`LeaveApprovalUiState` (`src/features/leave-approval/types.ts`) — a UI concept, never confused with the backend's own `leave_requests.status`:

```
loading → loaded ⇄ confirming_approval/confirming_rejection
                       │ (Confirm)
                       ▼
              preparing_verification (dev-fixture only — see §8)
                       ▼
        processing_approval / processing_rejection (dev-fixture only)
                       ▼
          approval_success / rejection_success (dev-fixture only)

loaded → (Confirm, on a REAL request id) → unavailable   [today's actual production path]
loaded (derived from real status) → expired | already_processed
error, cancelled — modeled and handled defensively; "cancelled" is never produced (no such backend status exists)
```

`deriveUiStateFromPresentation()` derives `loaded`/`expired`/`already_processed`/`unavailable` purely from `presentation.status` the moment a request loads; interactive states are reached only through local `useState` transitions in `app/(app)/leave/[id].tsx`, never from a fetch.

## 5. Component Inventory

`src/features/leave-approval/components/`: `LeaveRequestCard`, `StudentInformationSection`, `LeaveInformationSection`, `DetailRow` (multi-file reuse within this feature), `CountdownTimer`, `LeaveTimeline`, `ConfirmationPanel` (one generic component parameterized for both Approve and Reject — not two near-duplicates), `ProcessingIndicator`.

Reused, not duplicated: `Card`, `Badge`, `Button`, `EmptyState`, `ErrorState`, `SuccessState`, `Skeleton`, `PageContainer`, `PageHeader`, `SectionHeader`, `Divider`. **`SecurityBanner` was relocated** from `features/devices/components/` to `components/ui/` in this prompt — a second feature (leave-approval's dev-fixture banner) now needs the identical tone-based renderer, mirroring `SecurityInformationCard`'s exact Prompt 5 relocation precedent (name kept unchanged, same rationale).

Deliberately not built: separate `ApprovalButton`/`RejectButton` (the existing `Button` component already parameterizes label/variant/hint — a wrapper would add no behavior), a `SuccessCard` (composed instead from the existing `SuccessState` + `Card` + `Button`s), `FilterSheet`-equivalent (no filtering need exists for a list this small/thin).

## 6. Countdown Implementation

`src/features/leave-approval/countdownPresentation.ts`'s `deriveCountdownPresentation()` (pure, tested — future/near/zero/past/invalid/missing timestamp, accessibility formatting) feeds `CountdownTimer.tsx`. **No backend field currently supplies an expiry timestamp** (§1) — every real request renders the `"unavailable"` presentation ("Time remaining isn't available"), which is the honest, tested default, not an edge case. The component re-derives every 30 seconds (coarse enough to avoid excessive re-rendering) and stops once expired. No animation is used, so there is nothing to gate behind reduced-motion — text-only updates are reduced-motion-compatible by construction.

## 7. Timeline Architecture

`buildMinimalTimelineFromStatus()` derives a 1–3-step timeline purely from `status`+`createdAt` — no new fetch, no `leave_approval_events` read. The richer event vocabulary this prompt names (Academic Approval, Reception Verification, Student Exit) is **NOT APPLICABLE** (§1) and never appears. The middle step is always the generic "Awaiting parent response," regardless of which escalation stage/relationship is actually active — the same escalation-privacy principle `docs/notifications.md` already established for notifications.

## 8. Dev-Only Presentation Fixtures

`src/features/leave-approval/devFixtures.ts` — see that file's own doc comment for the full isolation argument. Summary: fixture keys are fixed non-UUID strings (`dev-awaiting`, `dev-approved`, `dev-rejected`, `dev-expired`, `dev-with-countdown`) that can never collide with a real `leave_requests.id`; every consulting call site is additionally gated behind `__DEV__` (`false` in a release bundle — confirmed via `expo export --platform android`, which still bundled cleanly with these branches present but inert); no production service or data path imports this file. `leave/index.tsx`'s dev-only fixture-link panel and `leave/[id].tsx`'s dev-only "Continue" buttons are the only consumers, both `__DEV__`-gated at the render site too.

## 9. Accessibility Checklist

- `accessibilityRole`/labels on every interactive control (cards, buttons, confirmation panel via `accessibilityRole="alert"`).
- `CountdownTimer` uses `accessibilityLiveRegion="polite"` with a full sentence `accessibilityLabel` distinct from the short visible label.
- `LeaveTimeline` never relies on color alone — every row's status is spelled out in text (`STATUS_LABEL`) alongside the dot's fill/border treatment.
- 44pt minimum touch targets on all pressables (`LeaveRequestCard`, `CountdownTimer`, `ConfirmationPanel`'s buttons).
- Dynamic text scaling: no fixed-height text containers.
- Dark mode: every color reads from `useTheme()`, no hardcoded literals.
- Native screen-reader verification **not performed** — no Android device/emulator available in this environment (unchanged limitation, `docs/notifications.md` §14).

## 10. Animation Summary

No new animation was introduced. `CountdownTimer` updates text only (no transition). Button press feedback reuses the existing `Button` component's opacity-on-press behavior. No looping/decorative animation, no artificial delays, no fake progress — dev-fixture state transitions are 100% explicit-tap-driven (`DevContinueButton`), never timer-based, so the "no artificial delays" rule holds even for the preview-only path.

## 11. Responsive Design

All new screens use `PageContainer`/`ScrollView` with relative spacing (`theme.spacing.*`), no fixed heights on text-bearing views, `flexShrink`/`numberOfLines` where text could overflow on a small phone. No web-only layout was introduced.

## 12. Testing Results

**Pure-logic (Vitest, this app's only test runner):** 5 new files — `leavePresentationMapper.test.ts`, `leaveStatusFormatter.test.ts`, `countdownPresentation.test.ts`, `leaveTimeline.test.ts`, `leaveDateFormatting.test.ts`. Full suite: **473 passed, 26 skipped** (up from the 427/26 Prompt 8 baseline by exactly the new tests), zero regressions.

**Not tested (documented, not silently skipped):** component/screen rendering — this app has no RN-aware test runner (`jest-expo`/`@testing-library/react-native`, unchanged open decision, `docs/foundation.md` §11). "Navigation: supported/unsupported leave IDs" is covered by Prompt 8's own `notificationDeepLink.test.ts` (unchanged, still passing) rather than duplicated here, since that pure function is the actual decision point and was not modified.

## 13. Native/Device Verification

**Not performed** — no Android emulator/device available (unchanged environment limitation). Automated verification substituted: full workspace typecheck, lint, format, the complete test suite, `expo export --platform android` (1341 modules, clean), `expo-doctor` (18/18).

## 14. Prompt 9B Integration Points

- `approvalService` (`src/services/approvals/approvals.ts`) — implement the four method bodies against the real generated hooks (`useListLeaveRequests`/`useGetLeaveRequest`/`useApproveLeaveRequest`/`useRejectLeaveRequest`). Return types are already `LeaveRequest` (not `unknown`) — no signature change needed.
- `LeaveRequestPresentation.student`/`.leaveType`/`.destination`/`.expiryTimestamp` — each documented in `types.ts` as to exactly why it's `null` today; Prompt 9B (or a dedicated data-wiring pass) can populate `student` via `students_select_linked_parent` without any UI redesign.
- `handleConfirmDecision()` in `leave/[id].tsx` — the real (non-fixture) branch currently sets `"unavailable"`; Prompt 9B replaces that branch with a real `useBiometric().stepUp()` call followed by `approvalService.approve()/reject()`, driving the SAME `preparing_verification`/`processing_approval`/`processing_rejection`/`approval_success`/`rejection_success` states this prompt already built and the dev fixtures already preview.
- `buildMinimalTimelineFromStatus()` can be superseded by a richer, real `leave_approval_events`-backed timeline without changing `LeaveTimeline`'s props contract (`LeaveTimelineEvent[]`).

## 15. Deferred Functionality (as of Prompt 9A)

Leave API integration, Supabase queries, approval/rejection mutations, biometric invocation, trusted-device verification, realtime synchronization, audit logging, offline synchronization, conflict resolution, expiry/timeout mutation, Reception Dashboard integration, Approval History business logic — all explicitly Prompt 9B (or later) scope, none implemented at that point.

## 16. Backend Integration (Prompt 9B)

Every §14 integration point has been implemented, wiring this screen to the already-real, already-tested backend (`apps/api/src/routes/leave.ts`) — no backend logic was duplicated client-side; no backend behavior was bypassed.

- **`approvalService`** (`src/services/approvals/approvals.ts`) — `RealApprovalService` now calls the generated plain functions (`listLeaveRequests`, `getLeaveRequest`, `approveLeaveRequest`, `rejectLeaveRequest` from `@digihostel/api-client-react`) directly. Signatures were unchanged from Prompt 9A, so `useLeaveApprovalDetails`/`usePendingApprovals` needed no changes at all.
- **`leaveErrors.ts`** — `mapLeaveApprovalError` now classifies the generated client's real `CustomFetchError` (`{status, message}`) by HTTP status plus the backend's own `{error:{code}}` body: 401→`unauthenticated`, 403 `device_revoked`→`device_revoked`, 403 `biometric_confirmation_required`→the new `biometric_verification_failed` kind (`types/errors.ts`), 403 other→`forbidden`, 404→`not_found`, 409→`conflict`, 400→`validation`, a raw `TypeError` (no HTTP response at all)→`network` (never conflated with `unknown` — the caller needs to know the mutation's outcome is genuinely uncertain).
- **`leaveDecisionReconciliation.ts`** (new, pure) + **`useDecideLeaveRequest.ts`** (new hook) — implement this prompt's explicit "never blindly resubmit a destructive mutation after an uncertain failure" requirement: on a `network`/`conflict` outcome, the hook re-reads the request directly (`approvalService.getById`, bypassing the cache) and the pure reconciler decides the next UI state from that authoritative read alone, never from the failed mutation's own assumption. Every other error kind is definite — the mutation certainly did not apply.
- **`app/(app)/leave/[id].tsx`**'s `handleConfirmDecision` — only the real (non-fixture) branch changed. Sequence: `useNetwork().status !== "online"` blocks before anything else (no destructive mutation is ever queued for offline execution); `useBiometric().stepUp("leave-decision:<id>", …)` runs next — a local biometric failure/cancel stops here (message via the existing `features/biometric/biometricMessages.ts`) and never reaches the network; only a real platform success calls `useDecideLeaveRequest().decide(...)`. The dev-fixture path (§8) is byte-for-byte unchanged.
- **`useLeaveRequestRealtime.ts`** (new hook, mirrors `useNotificationRealtime.ts` exactly) — subscribes to `leave_requests` Postgres Changes; the list screen uses it unfiltered (RLS scopes visibility), the detail screen filters to its own `id`. **`supabase/migrations/0002_realtime_publication.sql`** adds `leave_requests` (and `notifications`, closing the identical gap `useNotificationRealtime` had flagged since Prompt 8) to the `supabase_realtime` publication — no RLS change; `supabase/tests/database/11_realtime_publication.sql` verifies membership.
- **`PendingActionsCard.tsx`** — now calls `usePendingApprovals()` for real (same query key the leave screens use, so a decision anywhere invalidates everywhere): loading/error/zero/N-pending states, never a fabricated count.
- **Offline detection** (`NetworkContext.tsx`) — the Prompt 2 stub (always `"unknown"`) is now backed by `@react-native-community/netinfo` (new dependency — the exact package this file's own original doc comment named as the anticipated future choice). One file changed; no consumer besides this screen reads `status` yet.
- **Not changed, deliberately**: `student`/`leaveType`/`destination`/`expiryTimestamp` remain `null` (§1's "not applicable"/"missing" rows are still accurate — no backend field exists for any of them); device attestation (ADR-003) remains unimplemented (`NotImplementedAttestationGate`); the backend's biometric-freshness gate remains the documented non-cryptographic placeholder (`AssertionPresenceBiometricFreshnessGate`) — this app sends a real local-auth-derived assertion, but the backend's verification of it is unchanged and still weak by design, not silently claimed otherwise.
- **Testing**: `leaveErrors.test.ts`, `leaveDecisionReconciliation.test.ts`, `approvals.test.ts` (new, pure/mocked-client unit tests). No RN-aware test runner exists in this app (unchanged limitation, §12/§13) — `useDecideLeaveRequest`/`[id].tsx` themselves are not directly unit-tested; their non-React logic is fully covered via the pure reconciler.
- **Native/device verification**: still not performed (no Android/iOS device or emulator in this environment) — substituted with `expo export --platform android` and the full automated suite, matching §13's precedent exactly.

## 17. Reception-Initiated Parent Approval correction

Everywhere above that describes `"pending"` collapsing into the same actionable "awaiting response" bucket as `father_notified`/`mother_notified`/`guardian_notified`/`in_app_call`/`manual_verification` (§16's realtime/list wiring, `leavePresentationMapper.ts`'s original `AWAITING_RESPONSE_STATUSES` set) reflected the system as it stood at the time — a student-created leave request began the parent-approval/escalation lifecycle immediately, so treating `pending` as "awaiting response" was consistent with that behavior. That backend behavior was itself later judged a genuine product/architecture defect and corrected (the **Reception-Initiated Parent Approval correction** — see `docs/current-state.md`'s own correction paragraph and `apps/reception-dashboard/docs/parent-approval-session.md` §0/§16 for the full account): a leave request now sits in Reception's queue as `pending`, with zero parent-facing effect, until a Reception Warden/Hostel Admin/Super Admin explicitly sends it for parent approval.

This app was corrected to match, entirely within the existing presentation layer — no new screen, no new fetch, no new realtime subscription:

- **`leavePresentationMapper.ts`** — `mapBackendStatus()` no longer maps `"pending"` into `"awaiting_response"`. It now returns a new, dedicated `"not_yet_sent"` presentation status. `AWAITING_RESPONSE_STATUSES` (the set backing `filterAwaitingResponse()`) no longer includes `"pending"` at all — a `pending` request is therefore automatically excluded from `usePendingApprovals()`'s result, and so from the Pending Approvals list and the Dashboard's `PendingActionsCard` count, with no change needed to either of those consumers.
- **`types.ts`** — `LeaveApprovalPresentationStatus` gained `"not_yet_sent"`; `LeaveApprovalUiState` gained a matching `"not_yet_sent"` value, distinct from `"unavailable"` (which previously would have caught this case via the default branch and rendered the misleading "isn't available yet... coming in a future update" copy — wrong for a legitimate, expected state).
- **`leaveStatusFormatter.ts`** — a dedicated label ("Submitted, awaiting hostel review") and neutral tone for `"not_yet_sent"`, instead of falling through to the generic "Status unavailable" default.
- **`app/(app)/leave/[id].tsx`** — a new, honest render branch for `uiState === "not_yet_sent"` ("Your child's leave request has been submitted and is awaiting review by hostel reception. You'll be notified here once it's sent to you for approval."), inserted before the pre-existing `"unavailable"`/`"cancelled"` fallback branches so a `pending` request never reaches that generic copy.

No API call, realtime subscription, or biometric/mutation logic changed — this is purely a corrected classification of an already-real status value the backend has always sent. Regression: `leavePresentationMapper.test.ts`'s `it.each` list (previously asserted `pending → awaiting_response`, now corrected to assert `pending → not_yet_sent` as its own dedicated case) and `historyPresentationMapper.test.ts` (Approval History timeline, same mapper reused) both updated and passing; full `apps/parent-mobile` suite re-verified clean (410 passed, 6 pre-existing skipped — the skipped ones are the `DATABASE_URL`-gated integration suite, unaffected).
