import { isTerminalLeaveStatus } from "./types";
import type { LeaveQueueItem } from "./types";

/**
 * Student Verification handoff contract (Phase 3, Prompt 7B §41). Defines
 * ONLY the data the next workflow stage needs to pick up from a completed
 * Parent Approval Session — nothing more. Now consumed by
 * `LeaveDetailPage.tsx`'s "Verify Student" link and
 * `pages/StudentVerificationPage.tsx` (Phase 3, Prompt 7C — Student
 * Verification & Exit Authorization), which was previously a placeholder;
 * this contract needed no change to serve as its real handoff boundary.
 *
 * Deliberately excludes any parent identity/contact field — this dashboard
 * never has that information for a leave request in the first place (see
 * `docs/leave-queue.md`'s Parent/Guardian section), so there is nothing to
 * carry forward, not a field being withheld.
 */
export type LeaveApprovalOutcome = "approved" | "rejected" | "expired";

export interface SessionCompletionHandoff {
  leaveRequestId: string;
  studentId: string;
  studentRollNumber: string;
  /** The leave request's own id doubles as the session reference — see
   * `docs/leave-queue.md`'s Parent Approval Session Workspace section for
   * why no separate session identifier was minted. */
  approvalSessionReference: string;
  outcome: LeaveApprovalOutcome;
  /** The real `leave_requests.updatedAt` at the moment this view was built —
   * the authoritative timestamp of the terminal transition, not a
   * client-observed time. */
  occurredAt: string;
}

/** Builds the handoff view from a real, already-fetched queue item — returns
 * `null` for a non-terminal (still-active) session, since there is nothing
 * to hand off yet. Pure, no fetch of its own. */
export function buildSessionCompletionHandoff(
  item: LeaveQueueItem,
): SessionCompletionHandoff | null {
  if (!isTerminalLeaveStatus(item.status)) return null;
  if (item.status !== "approved" && item.status !== "rejected" && item.status !== "expired") {
    return null;
  }
  return {
    leaveRequestId: item.id,
    studentId: item.studentId,
    studentRollNumber: item.studentRollNumber,
    approvalSessionReference: item.id,
    outcome: item.status,
    occurredAt: item.updatedAt,
  };
}
