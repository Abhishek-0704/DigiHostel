import type { LeaveRequest } from "@digihostel/api-client-react";
import { mapLeaveRequestToPresentation, type LeaveRequestPresentation } from "../leave-approval";

/**
 * Approval History presentation model (Phase 4 Prompt 10) — no React/RN
 * import. Deliberately built ON TOP OF the existing `LeaveRequestPresentation`
 * (imported, not copied) rather than a second parallel data model — ADR-015
 * is explicit that "a parent's approval history view is simply a
 * filtered/joined query" over the same authoritative data Leave Approval
 * already reads, never a separate model.
 *
 * Adds exactly two fields Leave Approval's own presentation doesn't need:
 * `requestedAt` (an explicit alias of `createdAt`, for this feature's own
 * sort code to read without reaching into a differently-named field) and
 * `decidedAt` (the raw `updatedAt` timestamp, but ONLY for a request in a
 * terminal status — `approved`/`rejected`/`expired`. A terminal-status row
 * receives no further mutation after its deciding transition, so its
 * `updatedAt` IS authoritatively the decision time; for any other status,
 * no decision has happened yet, so this is `null`, never guessed).
 */
export interface HistoryRecordPresentation extends LeaveRequestPresentation {
  requestedAt: string | null;
  decidedAt: string | null;
}

const TERMINAL_STATUSES = new Set(["approved", "rejected", "expired"]);

export function mapLeaveRequestToHistoryRecord(
  leaveRequest: Pick<
    LeaveRequest,
    "id" | "studentId" | "reason" | "startDate" | "endDate" | "status" | "createdAt" | "updatedAt"
  >,
): HistoryRecordPresentation {
  const presentation = mapLeaveRequestToPresentation(leaveRequest);
  return {
    ...presentation,
    requestedAt: presentation.createdAt,
    decidedAt: TERMINAL_STATUSES.has(leaveRequest.status) ? leaveRequest.updatedAt : null,
  };
}
