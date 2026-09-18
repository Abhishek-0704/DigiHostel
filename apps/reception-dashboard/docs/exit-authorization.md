# Student Verification & Exit Authorization (Phase 3, Prompt 7C)

This document records the real, as-built architecture of the Exit Authorization workspace at `/students/:rollNumber/verification?leaveRequestId=<id>`, replacing the placeholder reserved at this route since Prompt 0.2 ("Student check-in/check-out — blocked on the Digital Library Pass backend"). See [`leave-queue.md`](leave-queue.md) (Prompt 7A) and [`parent-approval-session.md`](parent-approval-session.md) §13 (Prompt 7B, the handoff this workspace consumes) for the wider context.

## 1. Dependency Resolved / Existing Architecture Reused

This prompt depends directly on the Reception-Initiated Parent Approval correction: `leave_requests.status = "approved"` is only reachable via the corrected chain (Reception explicitly starts parent approval → parent genuinely decides `approved` via `decide()`), never automatically. That precondition — not a separate "session" concept — is what this workspace's "Parent approval" checklist item actually checks.

No parallel authorization architecture was created. This feature reuses:
- `leave_requests`/`leave_approval_events` (ADR-015) — unchanged, no new status value.
- The exact staff-authorization chain (`app.authenticate` → `requireStaffRole` → `requireAal2()`) every other staff-only leave-request route already uses.
- The exact hostel-scope helper (`hostelScopedForStaff`) `markExpired()`/`startParentApproval()` already use.
- The exact database-enforced-invariant pattern (`decide()`'s conditional UPDATE) for concurrency safety — adapted to an INSERT-only table via a `UNIQUE(leave_request_id)` constraint.
- The exact reception-dashboard mutation-hook shape (`useStartParentApproval`) for `useAuthorizeExit`.
- `sessionHandoff.ts`'s pre-existing `SessionCompletionHandoff` contract (Prompt 7B), which needed zero changes to serve as this feature's real handoff boundary.

## 2. Root Cause / What Was Genuinely Missing

Before this prompt: `leave_requests.status = "approved"` was the terminal fact of parent approval, but nothing recorded whether the student had actually, physically left the hostel afterward. No existing table represented this. `journey_events`/`qr_sessions`/`library_passes` (`packages/db/src/schema/library.ts`) were investigated and rejected as reusable — they belong to the separate, still-unbuilt Digital Library Pass module (SDD Ch.6): `journey_events.library_pass_id` is `NOT NULL` (a hostel-leave exit has nothing to do with a library pass), and its own INSERT policy hard-requires `biometric_confirmed = true`, which this prompt's explicitly manual-only verification would have had to fabricate. A new, minimal, single-purpose table (`leave_exit_authorizations`) was genuinely required.

## 3. Corrected/Completed Lifecycle

```
Parent Approved (leave_requests.status = "approved")
        ↓
Reception opens Verify Student (from the real handoff link on the Approval Session page)
        ↓
Verification Checklist evaluated from real, already-fetched data
        ↓
Reception manually confirms student identity (a staff attestation)
        ↓
Reception clicks "Authorize Exit" → explicit confirmation dialog
        ↓
POST /leave-requests/{id}/exit-authorization (server re-validates everything)
        ↓
Exit recorded (leave_exit_authorizations row, atomic with one manual_override
event + one audit_logs row)
        ↓
Realtime/query-invalidation updates the workspace
```

`leave_requests.status` is deliberately **not** mutated by this action — it stays `"approved"`. "The student has left the hostel" is a separate authoritative fact, captured by `leave_exit_authorizations`'s own existence, not by inventing a `completed`/`exited` enum value. This mirrors the same discipline already applied to keep SAP mentor approval out of `leave_requests.status` (never `SAP_APPROVED`).

## 4. Verification Checklist — Where Each Item Is Authoritatively Validated

| Checklist item | Client display source | Server-authoritative check |
|---|---|---|
| Leave request found and in scope | `useLeaveQueue()` (real, hostel-scoped queue data) | `authorizeExit()`'s own `SELECT ... WHERE id = ... AND <hostel-scope>` — a cross-hostel/nonexistent id gets an identical 404 |
| Mentor/SAP approval | Static, always "Not available — no SAP integration" | **Never checked server-side either** — no SAP data source exists anywhere in this repository (re-confirmed by direct search before this prompt); the endpoint's own OpenAPI description states this explicitly |
| Parent approval | `item.status === "approved"` (real queue data) + the real `responded`/`approved` event from `useLeaveApprovalEvents()` | `authorizeExit()`'s own `status !== "approved"` check → `409 exit_authorization_conflict` |
| No existing exit authorization | Not pre-checked — explicitly labeled "Verified by server" | `leave_exit_authorizations.leave_request_id`'s `UNIQUE` constraint — a concurrent/duplicate INSERT fails at the database level, caught and mapped to `409` |
| Student identity manually confirmed | Local component state (the checkbox) | The `POST` body's `identityConfirmed: true` field — `z.literal(true)`, `.strict()` schema; `false`/absent → `400`. This is the one item that is fundamentally a human attestation, not a server-re-derivable fact — see §6 |

The "Authorize Exit" button is disabled client-side until `isApproved && identityConfirmed` — this is a UX convenience only, never the authorization boundary; every one of the above checks is re-run server-side inside `authorizeExit()`'s own transaction regardless of what the client believes.

## 5. Backend Contract

`POST /api/v1/leave-requests/{leaveRequestId}/exit-authorization` (`apps/api/src/routes/leave.ts`) — staff-only (`reception_warden`/`hostel_admin`/`super_admin`), `requireAal2()`, hostel-scoped, dedicated rate-limit tier (`RATE_LIMIT_EXIT_AUTHORIZATION`, 30/min default). Request body: `{ identityConfirmed: true }` only (`.strict()` — any other field, including a forged `role`/`hostelId`/`staffId`/`studentId`/`parentId`/`mentorApproved`/`parentApproved`/`authorizationStatus`/`exitTimestamp`, is rejected outright with `400`, never parsed). Returns `201` with the new `ExitAuthorization` record (`id`, `leaveRequestId`, `identityConfirmed`, `authorizedAt`) — never which staff member authorized it (same actor-omission discipline as `LeaveApprovalEvent`).

`LeaveRepository.authorizeExit()` (`apps/api/src/domain/leave/repository.ts`): loads + hostel-scope-checks the leave request; if not `"approved"`, returns a clean conflict; otherwise attempts the INSERT inside the same transaction as one `manual_override` `leave_approval_events` row and one `leave.exit_authorized` `audit_logs` row. **The try/catch for the unique-violation wraps the entire transaction, not just the INSERT statement** — a real bug, found and fixed during this prompt's own live-Postgres integration testing: catching the error *inside* the transaction callback and returning normally left the transaction in Postgres's own "aborted" protocol state, causing `db.transaction()`'s subsequent COMMIT attempt to fail asynchronously, outside this method's control flow entirely. Letting the error propagate out of the callback lets the transaction roll back correctly first; only then is it classified and turned into a clean `{kind: "conflict", reason: "already_authorized"}` outcome.

## 6. Manual Identity Verification & Future Biometric Extension Point

Manual (checkbox) confirmation is the only mechanism implemented, exactly as this prompt requires — no biometric SDK, no QR, no face recognition, no new permission for a future biometric flow. The extension point is intentionally minimal: `AuthorizeExitInput.identityConfirmed` is a plain `true` literal today; a future biometric provider would supply the same field from a different UI control (a real assertion check, mirroring the leave-decision `biometricAssertion` pattern already established elsewhere in this domain) without requiring any change to the request shape, the database column, or the RLS policy that already requires it to be `true`.

## 7. Security Summary

Identical chain to every other staff-facing surface: Password → TOTP MFA → AAL2 → Staff Identity → Role → Hostel Scope → Backend Authorization → Database RLS. No client-supplied `staffId`/`studentId`/`hostelId`/`parentId`/`role`/`mentorApproved`/`parentApproved`/`authorizationStatus`/`exitTimestamp` is ever trusted — the request body accepts exactly one field (`identityConfirmed`), and every authorization decision is re-derived server-side from the authenticated caller's own resolved staff profile. `library_incharge` has no grant (matches every other leave-domain route). Concurrency/duplicate-prevention is database-enforced (`UNIQUE(leave_request_id)`), not merely a disabled button — live-verified via a real two-thread concurrent-call test against local Postgres, both at the repository layer and again at the full HTTP route layer.

## 8. Database / RLS

New table `leave_exit_authorizations` (`supabase/migrations/0011_exit_authorization.sql`, hand-written per this repository's established convention for policy-bearing migrations — `drizzle-kit generate`'s interactive policy-conflict resolver is unavailable in this non-TTY environment, matching migrations `0009`/`0010`'s own precedent). RLS: `lxa_select_own_student`/`lxa_select_linked_parent`/`lxa_select_reception`/`lxa_select_hostel_admin`/`lxa_select_super_admin` (identical shape to `leave_approval_events`'s own policy set, reusing the same `is_reception_for_student`/`is_hostel_admin_for_student` SECURITY DEFINER helpers), `lxa_insert_staff`/`lxa_insert_super_admin` (mirrors `lae_insert_reception_manual_override`'s exact join shape, plus `identity_confirmed = true` required in every `WITH CHECK`). No UPDATE/DELETE policy for any role — immutable by construction, matching `leave_approval_events`. New pgTAP suite: `supabase/tests/database/18_exit_authorization_rls.sql`, 21 assertions (same-hostel allow, cross-hostel deny, `identity_confirmed=false` rejected, forged actor id rejected, UNIQUE-constraint duplicate rejected, student/parent/hostel_admin/super_admin/library_incharge access matrix, immutability). Full suite: **183/183**, re-confirmed on a freshly reset database.

## 9. Realtime and State Authority

No new realtime channel — this workspace reuses `useLeaveQueueRealtime`/`useLeaveApprovalEventsRealtime` (Prompt 7A/7B) unchanged, and `useAuthorizeExit` additionally invalidates both query keys directly in `onSettled` (success or conflict alike), matching `useStartParentApproval`'s established pattern, so the UI reflects real server state immediately rather than waiting on the next realtime tick. The frontend checklist/button state is never the authorization authority — every real check is re-run server-side regardless of what the client believes (§4).

## 10. Testing Summary

- **Backend unit**: `apps/api/src/domain/leave/service.test.ts` — 11 new tests (`LeaveService.authorizeExit`) covering success, hostel-scoping, every non-approved status, already-authorized conflict, not-found.
- **Backend route (adversarial)**: `apps/api/src/routes/leave.test.ts` — 18 new tests covering the full matrix (unauthenticated, AAL1, wrong role including `library_incharge`, wrong hostel, nonexistent id, every non-approved status, already-authorized, concurrent duplicate calls, `identityConfirmed: false`/missing, forged extra body fields).
- **Backend live-Postgres integration**: `apps/api/src/domain/leave/repository.integration.test.ts` — 5 new tests against a real local Supabase instance (success with real staff/auth.users fixtures, wrong status, not-found, already-authorized **caught a real bug** — see §5, concurrency).
- **Database**: `supabase/tests/database/18_exit_authorization_rls.sql`, 21 assertions, **183/183** full suite.
- **Frontend**: `apps/reception-dashboard/src/pages/StudentVerificationPage.test.tsx` — 12 new tests (empty/not-found states, real data rendering, blocked banner for non-approved, mentor/SAP informational display, permission gating, checkbox-gates-button, confirmation dialog flow, error display, success state). `LeaveDetailPage.test.tsx` — 3 new tests for the real "Verify Student" link (presence, permission-gating, absence for non-terminal sessions).
- **Full workspace regression**: `typecheck`/`lint`/`format`/`build` all clean; `pnpm test`: **162 files, 1222 passed, 66 pre-existing skipped, 0 failed**.
- **Live end-to-end** (real local Supabase + a real running `apps/api` process, real password+TOTP+AAL2 sessions, no mocks): a 12-check HTTP-level script walked the complete corrected chain (create → send-for-parent-approval → parent approves → the full exit-authorization adversarial matrix → duplicate/concurrency → timeline order) — all passed; independently re-verified through the actual rendered Reception Dashboard UI in a browser: signed in as `reception1@example.test` (real TOTP), clicked "Send for Parent Approval", simulated the parent's real API decision, clicked the real "Verify Student" link, toggled the real identity-confirmation checkbox, clicked "Authorize Exit", confirmed the real dialog, and observed the real `201` response render as a live "Exit authorized" success state — then independently re-queried the database via a separate API call and confirmed the exit was genuinely, durably persisted (`[manual_override, responded, manual_override]` in the real timeline).

## 11. Documentation Generated / Modified

- `apps/reception-dashboard/docs/exit-authorization.md` (this file, new).
- `apps/reception-dashboard/docs/parent-approval-session.md` §13 (corrected: the handoff is now a real integration, not an unimplemented contract).
- `apps/reception-dashboard/src/features/leave/sessionHandoff.ts` (doc comment corrected to match).
- `docs/current-state.md` (new milestone entry — see the repository root document for the full narrative account).

## 12. Explicit Non-Goals (unchanged, not implemented by this prompt)

Biometric/QR/facial student verification, the return-to-hostel workflow, the Digital Library Pass module itself, Emergency/Health modules, the Audit Viewer, a new parent-authentication mechanism, RBAC/QG-01 redesign, an SAP scraper, or any occupancy/"inside vs. outside hostel" status column — `leave_exit_authorizations`'s own existence is the minimal authoritative record; deriving a broader occupancy model from it (if ever needed) is future work, not built now.

## 13. Engineering Readiness

**READY FOR OPERATIONAL WORKFLOW REVIEW** — the complete chain (SAP eligibility context, informational only) → DigiHostel Leave Request → Reception Queue → Reception-Initiated Parent Approval → Parent Approval → Student Identity Verification → Exit Authorization → Exit Record is genuinely implemented, server-authoritative at every step, and independently verified live (HTTP + browser + direct database re-query), with full regression passing and no weakening of any existing QG-01/ADR-025-protected boundary.
