import { LeaveRequestStatus, type StaffLeaveQueueItem } from "@digihostel/api-client-react";

/**
 * Reception Leave Request Queue domain/view-model types (Phase 3, Prompt
 * 7A). `LeaveQueueItem` is simply the generated `StaffLeaveQueueItem` shape
 * — this app never redefines a type the OpenAPI contract already supplies
 * (§32/§38's "no speculative database/API design" rule extends to not
 * duplicating a contract that already exists).
 *
 * `LEAVE_REQUEST_STATUSES` is derived from the generated `LeaveRequestStatus`
 * const object rather than retyped as a literal array — the real backend
 * enum (packages/db/src/schema/enums.ts) is the one source of truth for this
 * vocabulary; duplicating it here as a second literal list would risk silent
 * drift the moment the schema changes.
 */
export type LeaveQueueItem = StaffLeaveQueueItem;

export const LEAVE_REQUEST_STATUSES = Object.values(LeaveRequestStatus);

/**
 * The two independent workflow dimensions this queue must never flatten
 * into one misleading status (§18 of Prompt 7A — "a request can be Mentor
 * Approved while simultaneously Waiting for Parent"):
 *
 * - Parent Approval stage: derived directly from `leave_requests.status`
 *   (the DigiHostel Hostel-Leaving Request's own real state machine).
 * - Mentor/SAP Approval: a SEPARATE, KIIT-SAP-sourced concept this
 *   repository has no working integration for at all (confirmed by
 *   inspection — see docs/leave-queue.md's SAP Integration Summary) —
 *   always BLOCKED, never inferred from the parent-approval status.
 */
export type MentorApprovalAvailability = "blocked";

export const MENTOR_APPROVAL_STATUS: MentorApprovalAvailability = "blocked";

/** Terminal statuses (never advance further) — mirrors
 * apps/api/src/domain/leave/types.ts's own TERMINAL_STATUSES exactly,
 * re-declared here (not imported — this frontend package has no dependency
 * on the backend's internal domain module) since it is part of the same
 * public LeaveRequestStatus vocabulary this file already re-derives above. */
export const TERMINAL_LEAVE_STATUSES: readonly LeaveRequestStatus[] = [
  LeaveRequestStatus.approved,
  LeaveRequestStatus.rejected,
  LeaveRequestStatus.expired,
];

export function isTerminalLeaveStatus(status: LeaveRequestStatus): boolean {
  return (TERMINAL_LEAVE_STATUSES as readonly string[]).includes(status);
}

export interface LeaveQueueFilters {
  statuses: LeaveRequestStatus[];
  /** Excludes approved/rejected/expired — the common "what still needs
   * attention" view (§16 of Prompt 7A). Combined with `statuses` via AND,
   * same composition rule `matchesFilters` in filtering.ts documents. */
  unresolvedOnly: boolean;
}

export function emptyLeaveQueueFilters(): LeaveQueueFilters {
  return { statuses: [], unresolvedOnly: false };
}

export type LeaveQueueSortOrder = "newest" | "oldest" | "waiting_time" | "student_name";
