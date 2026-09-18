# Parent Approval Session Management (Phase 3, Prompt 7B)

This document records the real, as-built architecture of the Parent Approval Session Workspace at `/leave/:id`, replacing the placeholder `LeaveDetailPage` reserved for this exact purpose since Prompt 4 ("Approval session monitoring — Phase 3, Prompt 7B"). See [`leave-queue.md`](leave-queue.md) (Phase 3, Prompt 7A — the queue this workspace is opened from) and the repo-root `docs/current-state.md` for the wider verification history, including the independent `lae_select_staff` QG-01 security review and remediation this prompt depends on.

## 0. Correction notice — Reception-Initiated Parent Approval correction (supersedes §1's central claim)

**§1 below, as originally written, is factually WRONG about the current system and is kept only as a historical record of Prompt 7B's own reasoning at the time — do not act on it.** A follow-up correction (the "Reception-Initiated Parent Approval correction") found that automatically starting the parent-approval/escalation lifecycle at student leave-request creation was a genuine product/architecture defect, not the intended design: a student's request must sit in Reception's queue, untouched, until a Reception Warden/Hostel Admin/Super Admin explicitly reviews it and clicks **"Send for Parent Approval."** Only that explicit action now starts the lifecycle. See §16 for the full corrected architecture, backend change, and live verification evidence. `leave-queue.md`'s equivalent claims are corrected the same way — see its own §0.

(`leave-queue.md`, Prompt 7A, predates this document and correctly scoped itself out of any Parent Approval Session claim at the time — "no...Parent Approval Session creation...reserved for Prompt 7B" — so it needs no equivalent correction here.)

Concretely, as of this correction:
- `LeaveRepository.create()` (`apps/api/src/domain/leave/repository.ts`) no longer calls `enqueueEscalationJob()`. A freshly-created request is `pending` with **no** parent notification, **no** escalation timer, and **no** `leave_approval_events` row of any kind.
- A new staff-only, AAL2-protected endpoint, `POST /leave-requests/{id}/send-for-parent-approval`, is the **only** path out of `pending` — conditionally transitions to `father_notified` and schedules the first escalation/notification job, exactly mirroring how `decide()`/`markExpired()` already made their own transitions database-race-safe.
- This workspace (`LeaveDetailPage`) is no longer *purely* a monitoring page — for a `pending` request specifically, it is also where Reception makes and executes that one explicit decision (see §16). Every other section below (state model, realtime, timer, audit, etc.) is otherwise still accurate for a request that has already left `pending`.

## 1. The central architectural finding: there is no "session" entity

**⚠ See §0 — the claim in this section's first paragraph is now corrected; kept verbatim below for historical accuracy only.**

Before writing any code, this prompt's own mandatory reconnaissance (§4/§6) inspected the actual escalation/notification architecture (ADR-017/ADR-018/ADR-019) and found a fact that reframes the entire feature: ~~**the real parent-approval process already begins automatically the moment a student creates a leave request.**~~ `LeaveRepository.create()` (`apps/api/src/domain/leave/repository.ts`, unchanged) ~~schedules the first escalation job (`enqueueEscalationJob`) in the same transaction as the insert. There is no "reception clicks Start" step anywhere in the accepted architecture — by the time a request appears in the Reception Queue at all, its escalation is already running (or already terminal).~~ **(No longer true — see §0/§16. This was Prompt 7B's own contemporaneous, correctly-inspected finding about the system as it existed at that time; the system itself has since been corrected.)**

The rest of this section's reasoning — no separate "session" database entity, `leave_requests.status` itself is the authoritative state, no second identifier — remains entirely correct and unaffected by the correction.

Consequently, **no new database entity, "session" table, or "create session" mutation was built.** The `leave_requests` row itself — specifically its `status` column, which can only ever be one value at a time — already *is* the session, and this workspace is a real-time **monitoring** page over it, not a page that creates anything. This is a deliberate, evidence-based deviation from this prompt's own literal framing ("initiate a parent approval session"), per its own §4 instruction: *"If an assumption in this prompt conflicts with the actual implemented architecture, do not silently overwrite the architecture. Document the discrepancy and choose the safest implementation that preserves the established system."* The alternative — building a parallel "session" concept that could drift from the authoritative `leave_requests.status` — was rejected as exactly the kind of duplicate concept §6 forbids.

Practical consequences of this framing, each closing a section of this prompt's own requirements:

- **Session identifier** (§11): the existing `leaveRequestId` (a server-generated UUID). No second identifier was minted — it already satisfies every stated property (unique, non-guessable, server-generated), and the Parent App already keys its entire leave-approval UI off this exact value (`apps/parent-mobile/docs/leave-approval.md`), so reusing it avoids inventing a second reference the two apps would have to keep in sync.
- **Duplicate-session prevention** (§10): structural, not a new constraint. A `leave_requests` row has exactly one `status` at a time — "one active session per leave request" was already true before this prompt, by construction.
- **Concurrency** (§33): two reception browsers opening the same `/leave/:id` are simply two read-only viewers of the same authoritative row; there is no write race to resolve here, because this workspace performs no session-creating write at all.

## 2. Session state model

No new state machine was introduced. The workspace renders the real, existing `leave_requests.status` vocabulary (`packages/db/src/schema/enums.ts`, unchanged) through the same presentation layer Prompt 7A already built (`ApprovalProgressIndicator`, `LeaveStatusBadge`) — `pending → father_notified → mother_notified → guardian_notified → in_app_call → manual_verification → {approved | rejected | expired}`. Per §0/§16's correction, the `pending → father_notified` transition is no longer automatic — it happens only when Reception clicks "Send for Parent Approval," and `pending` itself now means "not yet sent," not "escalation about to start." `manual_verification` (escalation exhausted, ADR-019 §2) gets one additional, honest, real-data-derived note in this workspace: *"Automated escalation is exhausted... Manual verification is required next; no automatic action will occur."* No `ESCALATED`/`CANCELLED` frontend-only state was invented, and no escalation algorithm was implemented — advancing the state machine remains entirely the pre-existing escalation worker's job (`apps/api/src/workers/escalationWorker.ts`, untouched).

## 3. Backend addition: staff access to the Approval-Event Timeline

The one genuinely new backend capability this prompt adds: `GET /leave-requests/{id}/events` (Approval History, Phase 4 Prompt 10) is now also reachable by staff (`reception_warden`/`hostel_admin`/`super_admin`, AAL2-required, hostel-scoped) — Prompt 7A had deliberately left this unbuilt, flagging the underlying `lae_select_staff` RLS policy as unscoped and therefore unsafe to build a new staff route on top of. That gap was independently found, remediated (`supabase/migrations/0010_lae_select_staff_hostel_scope.sql`), and re-verified (QG-01: **PASSED**) before this route extension was written — see `docs/current-state.md`'s remediation paragraph for the full evidence trail.

- `apps/api/src/lib/auth/guards.ts` gained `requireAal2ForStaffCallers()` — a no-op for student/parent callers (who have no AAL2 concept at all), fails closed on anything but `aal2` for a staff caller. Composed on the *shared* events route instead of `requireAal2()`, which cannot be applied unconditionally to a route serving non-staff callers too.
- `LeaveRepository.findAccessibleLeaveRequestForStaff()` — the same hostel-scope check `markExpired()`/`listForStaffQueue()` already use (`hostelScopedForStaff`/`super_admin` bypass), reused rather than duplicated.
- `LeaveService.getEventsForStaff()` — same anti-enumeration shape as `getEventsForParent`/`getEventsForStudent`: an inaccessible leave request yields the identical 404 a nonexistent one would.
- `library_incharge` gets `403 role_required` — no RLS grant on `leave_requests` for that role anywhere in this schema, so none is invented here either.

This Fastify route is **defense-in-depth on top of** the corrected RLS, never a substitute for it — the corrected `lae_select_reception`/`lae_select_hostel_admin`/`lae_select_super_admin` policies are what actually protect direct PostgREST/Realtime access; this route only adds the missing read path for this one legitimate client.

## 4. Realtime synchronization strategy

Two independent, already-established-pattern subscriptions, each invalidating its own query:

- `useLeaveQueueRealtime` (Prompt 7A, reused unchanged) — the same instance/pattern the Queue page uses, invalidating `["leave-queue"]`. Since this workspace also reads from that same query (finding the current item by id), a real `leave_requests` change anywhere updates this page too.
- `useLeaveApprovalEventsRealtime` (new, `hooks/`) — a direct port of `apps/parent-mobile/src/hooks/useLeaveApprovalEventsRealtime.ts`'s already-proven pattern, filtered to `leave_request_id=eq.<id>`, invalidating `["leave-approval-events", id]`. `leave_approval_events` has been in the `supabase_realtime` publication since Prompt 9B/F-08; the corrected staff RLS policies (§3) now scope exactly which rows a given staff subscriber's channel receives.

Both hooks follow the codebase's single established rule: a realtime event never merges its own payload into state — it only triggers a refetch of the authoritative REST query. **Live-verified** (not just unit-tested): a real `UPDATE leave_requests SET status = ...` and a real `INSERT INTO leave_approval_events` issued directly against the database, with the workspace already open in a browser, updated the page — new status, recalculated timer, new timeline row, and (for a terminal status) the result banner — with zero manual refresh. See §14 (Testing Summary) for the full transcript.

## 5. Session Workspace architecture

```
LeaveDetailPage (composition only)
  ├─ useLeaveQueue()                    — reused from Prompt 7A; find(id) resolves this page's item
  ├─ useLeaveApprovalEvents(id)         — new: GET /leave-requests/{id}/events (now staff-reachable)
  ├─ useLeaveQueueRealtime()            — reused
  ├─ useLeaveApprovalEventsRealtime(id) — new
  └─ components/leave/*
       ApprovalProgressIndicator (7A)   — Parent Approval vs Mentor/SAP, unchanged
       SessionResultBanner (new)        — terminal-state accessible live region
       SessionTimer (new)               — real elapsed time + labeled estimate
       SessionTimeline (new)            — real leave_approval_events rendering
```

No "session view model" hook was introduced beyond the two query hooks above — deriving `item`/`handoff` is a two-line `useMemo`/pure-function call directly in the page, which is all the actual complexity here warrants (§23's "keep session lifecycle logic outside presentation components" is satisfied by keeping that logic in `features/leave/sessionHandoff.ts`, a plain function, not by adding a dedicated hook with nothing left to do).

## 6. Timer & timeout strategy

`elapsed` (time since `updatedAt`) is real, ticking every second (`useCurrentDateTime(1000)` — the one deliberate exception to this app's default 60s tick, justified because a live countdown is this component's whole purpose). Per §0/§16's correction, `SessionTimer` now also suppresses the "next automated check" estimate for a `pending` request, identically to a terminal one — no escalation job is scheduled until Reception explicitly sends it for parent approval, so there is genuinely nothing to estimate. `estimatedNextCheckMs` (`features/leave/sessionTimer.ts`) is `ESCALATION_STAGE_TIMEOUT_MS`'s real, existing default (90s, `apps/api/src/config/escalation.ts`, ADR-017 §2) minus elapsed — **always labeled "(estimated)" in the UI**, with an explicit caveat sentence, never presented as authoritative. This value is *not* exposed by any endpoint (adding one purely to back a timer estimate was judged out of this prompt's minimal-safe-change scope) — if the deployment overrides `ESCALATION_STAGE_TIMEOUT_MS` via environment variable, this display's estimate will silently drift from the real value, which is exactly why it is never claimed as authoritative. The one and only authority for whether/when a transition actually happens remains the escalation worker, unchanged, observed only via realtime.

## 7. Security summary

Identical chain to every other staff-facing surface in this application: Password → TOTP MFA → AAL2 → Staff Identity → Role → Hostel Scope → Backend Authorization → Database RLS. No new permission was added — "Open Approval Session" (the renamed, now-real Prompt 7A placeholder button) is still gated by the pre-existing `leave:parent_approval:initiate`; the route itself is gated by the pre-existing `leave:queue:view` (matching the Queue page — the same roles that can see the queue can open a session workspace for an item they're authorized on). Cross-hostel access is denied identically whether reached via a queue click or a directly-typed URL, live-verified (§14). No client-supplied `staffId`/`hostelId`/`parentId`/`studentId` is ever trusted — this page sends no such parameters at all; every authorization decision is re-derived server-side from the authenticated caller's own resolved `staff` row.

## 8. Audit preparation summary

The real, permanent, already-persisted audit trail for this workflow is the `leave_approval_events` table itself (ADR-015) plus `audit_logs` rows the backend's existing `decide()`/`advanceEscalation()`/`markExpired()` write on every real transition (all unchanged by this prompt). This workspace does not create a second audit system, a "SESSION_CREATED"/"NOTIFICATION_DISPATCH_REQUESTED"-shaped event log, or an Audit Viewer — those events largely have no real backend counterpart (see §9), and inventing client-local pseudo-events for them would be exactly the "falsely claim an event was persisted" failure this prompt explicitly forbids (§25/§42). What this workspace adds is purely a *read* path onto the audit trail that already exists.

## 9. Notification dispatch boundary — REAL, PARTIAL, and BLOCKED, honestly separated

| Claim | Classification | Evidence |
|---|---|---|
| A parent-approval notification is genuinely dispatched at each stage | **REAL** | The pre-existing, unchanged notification worker (`apps/api/src/workers/notificationWorker.ts`, ADR-018) — ATTEMPTS delivery automatically; this prompt triggers nothing new |
| Reception can see the real current escalation stage | **REAL** | `leave_requests.status`, already shown since Prompt 7A |
| Reception can see a real, immutable timeline of stage transitions and parent responses | **REAL** (new in this prompt) | `leave_approval_events`, now staff-readable (§3) |
| Reception can see per-notification delivery status (queued/sent/delivered/failed) | **BLOCKED** | The `notifications` table (ADR-018's actual delivery-tracking rows) has zero RLS grant for any staff role — confirmed in Prompt 6 (`docs/rls-policy-matrix.md`: "staff (any role) ❌"); this remains true, unchanged, and this prompt does not attempt to work around it |
| A `"notified"` event fires in the timeline every time a notification is sent | **Corrected finding, not previously documented**: re-confirmed by direct inspection of `advanceEscalation()` — the real code path inserts an `"escalated"` event on a stage transition, never a `"notified"` one. No current worker inserts `event_type: 'notified'` at all; the one example in `seed.sql` is static fixture data, not evidence of real behavior. `SessionTimeline`'s label map still includes `"notified"` (it is part of the schema's real enum, `ADR-015`), but reception should expect to see `"escalated"`/`"responded"`/`"expired"`/`"manual_override"` in practice, not `"notified"` |

This workspace never displays "Notification Sent" or any other delivery-confirmation language — only the real, observable facts above.

## 10. Loading & error strategy

Four distinct states, matching the Queue page's own established shape: (1) queue still resolving → `ContentLayout`'s shared loading takeover; (2) a real fetch error → shared error state with retry; (3) the id resolves to no accessible item (wrong hostel, nonexistent, or nonexistent user-typed id) → an honest, anti-enumeration-consistent message, never distinguishing "doesn't exist" from "not yours"; (4) found → full workspace, with the Timeline's own independent loading/error/empty states (mirroring `LeaveRequestTable`'s established pattern).

## 11. Accessibility summary

`SessionResultBanner` is the one genuine live region (`role="status"`, `aria-live="polite"`) — announces the terminal outcome the moment it appears, satisfying this prompt's explicit "ensure the result is announced accessibly" requirement, never color-only (icon + text together). `SessionTimer` deliberately is **not** a live region — a per-second announcement would be accessibility noise, not help; this is a conscious design decision, not an oversight. Keyboard/focus/semantic-heading structure otherwise follows the same established shell conventions as every other Reception Dashboard page.

## 12. Performance summary

`SessionTimer` is the only component in this app requesting a sub-minute tick (1s), and it re-renders only itself, not the page (`useCurrentDateTime`'s own state is local to whichever component calls it). No polling loop was added anywhere — both realtime hooks are event-driven, with a refetch only on an actual `postgres_changes` event or an explicit user-triggered refresh.

## 13. Student Verification handoff

`features/leave/sessionHandoff.ts` defines `SessionCompletionHandoff` — a pure, typed view built from already-fetched data (never a new fetch), returning `null` for any non-terminal status. **Now a real, live integration** (Phase 3, Prompt 7C — Student Verification & Exit Authorization, `apps/reception-dashboard/docs/exit-authorization.md`): `LeaveDetailPage.tsx`'s "Ready for Student Verification" note now includes a real, permission-gated "Verify Student" link (visible only for `outcome === "approved"`), navigating to `studentVerificationPath(handoff.studentRollNumber)?leaveRequestId=<id>` — this contract needed no change to serve as that real handoff boundary. Deliberately excludes any parent identity field, since this dashboard never has that data for a leave request to begin with.

## 14. Testing summary

- **Backend**: 6 new tests (`apps/api/src/routes/leave.test.ts`, new "GET /leave-requests/:leaveRequestId/events — staff access" describe block) — own-hostel allow, AAL1 denial, cross-hostel denial, super_admin unscoped, `library_incharge` denial, nonexistent-id 404. Full `leave.test.ts`: **86/86 passing**.
- **Frontend**: 33 new tests across `features/leave/sessionTimer.test.ts`, `sessionHandoff.test.ts`, `components/leave/SessionTimer.test.tsx`, `SessionTimeline.test.tsx`, `SessionResultBanner.test.tsx`, `pages/LeaveDetailPage.test.tsx`, plus updated `LeaveRequestDetailPanel.test.tsx` (the button's real-navigation behavior replacing its old always-disabled assertion).
- **Database**: no schema/RLS change in this prompt — `supabase test db` re-confirmed unaffected at **162/162**.
- **Full workspace regression**: `typecheck`/`lint`/`format`/`build` all clean; `pnpm test`: **1139 passed, 57 pre-existing skipped, 0 failed**.
- **Live browser + integration verification** (real local Supabase + `apps/api`, real password+TOTP+AAL2 for two distinct staff identities): opened a real Session Workspace from the Queue via the real "Open Approval Session" button; confirmed real student/leave data, real `ApprovalProgressIndicator`, real timer; **live realtime proof** — a direct `UPDATE leave_requests`/`INSERT leave_approval_events` against the database, with the page already open, updated the status badge, recalculated the timer, and appended a new timeline row with zero manual refresh; simulating a real parent approval produced the live `SessionResultBanner` ("✓ Session approved") and the real Student Verification handoff note; cross-hostel denial was independently re-confirmed by directly navigating a Utkal-scoped staff session to a Kalinga leave request's URL, receiving the same honest anti-enumeration message the Queue's own detail panel already uses.

## 15. Known limitations / open dependencies

1. Per-notification delivery status remains BLOCKED for staff (§9) — an architectural characteristic of the `notifications` table's RLS, unrelated to and unchanged by this prompt.
2. The "estimated next check" timer can silently drift from reality if `ESCALATION_STAGE_TIMEOUT_MS` is overridden in a given deployment (§6) — documented, not hidden.
3. Student Verification (the next workflow stage) is not implemented; only a typed handoff contract exists (§13).
4. No escalation algorithm, manual-call workflow, or biometric implementation exists in this dashboard — all remain exactly as owned by the Parent App / existing backend workers, unchanged.

## 16. Reception-Initiated Parent Approval correction

Corrects §1's central finding — see §0. This section is the authoritative record of the corrected architecture.

### 16.1 Corrected workflow

Student creates request → sits in Reception's queue as `pending`, with **zero** side effects (no parent notified, no timer, no event) → Reception Warden/Hostel Admin/Super Admin reviews it (optionally cross-referencing SAP mentor-approval information as eligibility evidence — never conflated with parent approval, and never represented as a `leave_requests.status` value) → clicks **"Send for Parent Approval"** on this workspace → backend atomically transitions `pending → father_notified` and schedules the first escalation/notification job → the existing, unchanged escalation/notification/parent-decision machinery takes over exactly as documented in §2–§9 above.

### 16.2 Backend contract

`POST /api/v1/leave-requests/{leaveRequestId}/send-for-parent-approval` (`apps/api/src/routes/leave.ts`) — staff-only (`reception_warden`/`hostel_admin`/`super_admin`), `requireAal2()` (staff-only route, unlike the shared events route which needs `requireAal2ForStaffCallers()`), hostel-scoped for `reception_warden`/`hostel_admin` via the same `hostelScopedForStaff` helper `markExpired()`/`listForStaffQueue()` already use, unscoped for `super_admin`. Conditionally transitions `pending → father_notified` via the same optimistic-concurrency conditional-`UPDATE ... WHERE status = 'pending'` pattern `decide()`/`markExpired()` already established — "exactly one caller can ever start it" is a database invariant, not a disabled-button convention. Writes one `leave_approval_events` row (`event_type: "manual_override"`, `actor_staff_id` set — the one existing event type that already carried a staff actor, reused rather than adding a new enum value) and one `audit_logs` row (`leave.parent_approval_started`). Returns 404 for both "doesn't exist" and "wrong hostel" (anti-enumeration, matching every other staff leave-request route); 409 for "not currently pending" (already started, or a losing concurrent call).

The backend's own authorization boundary was tightened alongside this: `PARENT_DECIDABLE_STATUSES` (`apps/api/src/domain/leave/types.ts`) — `DECIDABLE_STATUSES` minus `"pending"` — is now what `decide()` actually checks, so a parent genuinely cannot approve/reject a `pending` request even by directly calling the API, independent of anything this dashboard does or doesn't render. This directly contradicted [ADR-016](../../../docs/adr/ADR-016-leave-escalation-approval-authority.md)'s own accepted text (which had explicitly listed `pending` as a decidable status) and was formally superseded, narrowly, by [ADR-025](../../../docs/adr/ADR-025-parent-decision-authority-excludes-pending.md) — see `docs/current-state.md`'s correction paragraph for the full governance account. ADR-016's actual Model C decision (relationship-based, not escalation-stage-restricted, parent authority) is unaffected.

### 16.3 Frontend wiring

- `services/leave/LeaveService.ts` gained `startParentApproval(leaveRequestId)`, calling the generated `startParentApproval` plain function (matching `listQueue`'s existing plain-function-call shape).
- `features/leave/useStartParentApproval.ts` (new) — a `useMutation` wrapper returning an `AppError`-mapped state object (`start`/`isPending`/`error`/`reset`), matching `useLeaveQueue`'s established shape. Invalidates both `LEAVE_QUEUE_QUERY_KEY` and this request's own approval-events query key in `onSettled` (success or 409 alike), so the UI reflects real server state immediately rather than waiting on the next realtime tick.
- `pages/LeaveDetailPage.tsx` — for `item.status === "pending"`, renders a `Can permission="leave:parent_approval:initiate"`-gated panel: an explanatory note ("has not been sent for parent approval yet... no parent has been notified and no escalation timer has started"), a "Send for Parent Approval" button (`Button`'s existing `loading` prop for in-flight state), and an inline `role="alert"` error on failure. `leave:parent_approval:initiate` is the same permission `LeaveRequestDetailPanel`'s "Open Approval Session" button already used — no new permission was added.
- `components/leave/SessionTimer.tsx` — `pending` is now treated identically to a terminal status for suppressing the "next automated check" estimate (§6).

### 16.4 A real bug found and fixed by live browser verification

Live-clicking the new button through a real browser against the real running API initially failed with `400 FST_ERR_CTP_EMPTY_JSON_BODY` — Fastify's default JSON body parser rejects a request that carries `Content-Type: application/json` with no body. `packages/api-client-react/src/custom-fetch.ts`'s fetch mutator was unconditionally setting that header on every request regardless of whether a body existed. This is shared infrastructure (not a route- or app-specific bug): it affected every no-body POST route, including the pre-existing `/expire` — never caught before because `/expire` has no live UI button wired through this real fetch path yet, and every backend route test uses Fastify's `app.inject()`, which bypasses this client entirely. **Fixed** at the source (`custom-fetch.ts` now only sets `Content-Type: application/json` when `config.data` is present), with 3 new regression tests (`custom-fetch.test.ts`). Re-verified live after the fix: the same click now returns `200`, and the workspace updates to "Father notified" with a real "Manual override recorded" timeline entry, with no page reload.

### 16.5 Verification

- **Backend**: new `apps/api/src/domain/leave/service.test.ts`/`repository.integration.test.ts` (real Postgres) coverage for `startParentApproval()` (success, hostel-scoping, conflict, not-found, concurrency); new `apps/api/src/routes/leave.test.ts` adversarial matrix (unauthenticated, AAL1, wrong role including `library_incharge`, wrong hostel, nonexistent id, already-non-pending conflict, concurrent duplicate calls).
- **Frontend**: `LeaveDetailPage.test.tsx` (button visibility gated by status and permission), `SessionTimer.test.tsx` (pending suppresses the estimate), `custom-fetch.test.ts` (Content-Type fix).
- **Live, real end-to-end** (real local Supabase + a real running `apps/api` process, real password+TOTP+AAL2 sessions, no mocks): an HTTP-level script (student creates → parent premature-approve rejected 409 → wrong-hostel reception denied 404 → same-hostel reception AAL1 denied 403 → same-hostel reception AAL2 succeeds 200 → duplicate call rejected 409 → parent approve now succeeds 200 → timeline shows `[manual_override, responded]` in order) passed in full; then independently re-verified through the actual rendered browser UI (see §16.4) — the "Send for Parent Approval" button, permission-gated, correctly starts the process and the workspace updates live.

### 16.6 Known limitations unaffected by this correction

The same limitations already listed in §15 continue to apply unchanged. No new limitation was introduced by this correction beyond what §16.4 already fixed.
