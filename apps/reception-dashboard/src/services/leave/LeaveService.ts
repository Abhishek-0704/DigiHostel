import {
  listStaffLeaveQueue,
  startParentApproval,
  authorizeExit,
  type StaffLeaveQueueItem,
  type LeaveRequest,
  type ExitAuthorization,
} from "@digihostel/api-client-react";

/**
 * Leave Queue service (Phase 3, Prompt 7A) — real implementation, replacing
 * Prompt 0.2's interface-only placeholder. Calls the generated plain
 * function from `@digihostel/api-client-react` directly (not the
 * React-hook wrapper — this module is a plain service, consumed by its own
 * feature hook, `features/leave-queue/useLeaveQueue.ts`), matching this
 * workspace's existing established pattern
 * (`apps/parent-mobile/src/services/approvals/approvals.ts`).
 *
 * The backend contract (`GET /api/v1/leave-requests/queue`) is new as of
 * this prompt — see `apps/api/src/routes/leave.ts` and
 * `apps/reception-dashboard/docs/leave-queue.md` for the full
 * authorization/hostel-scoping model this relies on. This service performs
 * no authorization/scoping itself: the backend resolves the caller's own
 * staff role/hostel server-side and returns only what that caller is
 * authorized to see — this is a thin transport wrapper, nothing more.
 */
export interface LeaveQueueService {
  listQueue(): Promise<StaffLeaveQueueItem[]>;
  /** Reception-Initiated Parent Approval correction — the one and only path
   * that moves a `pending` leave request into the parent-approval/escalation
   * lifecycle. Calls `POST /leave-requests/{id}/send-for-parent-approval`
   * (staff-only, AAL2-protected, hostel-scoped — all enforced server-side;
   * this method performs no authorization of its own, same as
   * `listQueue`). */
  startParentApproval(leaveRequestId: string): Promise<LeaveRequest>;
  /** Phase 3, Prompt 7C — Student Verification & Exit Authorization. The
   * final Reception-side checkpoint before a student is permitted to leave
   * the hostel. Calls `POST /leave-requests/{id}/exit-authorization`
   * (staff-only, AAL2-protected, hostel-scoped, requires the leave request
   * to already be `approved` — all enforced server-side; this method
   * performs no authorization of its own, same as `listQueue`/
   * `startParentApproval`). `identityConfirmed` must be `true` — a staff
   * attestation the server cannot independently re-derive. */
  authorizeExit(leaveRequestId: string, identityConfirmed: true): Promise<ExitAuthorization>;
}

export const leaveQueueService: LeaveQueueService = {
  async listQueue() {
    return listStaffLeaveQueue();
  },
  async startParentApproval(leaveRequestId: string) {
    return startParentApproval(leaveRequestId);
  },
  async authorizeExit(leaveRequestId: string, identityConfirmed: true) {
    return authorizeExit(leaveRequestId, { identityConfirmed });
  },
};

export type { StaffLeaveQueueItem, ExitAuthorization };
