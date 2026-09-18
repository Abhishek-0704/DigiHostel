import type { LeaveRequest } from "@digihostel/api-client-react";
import type {
  LeaveApprovalUiState,
  LeaveApprovalPresentationStatus,
  LeaveRequestPresentation,
} from "./types";

/**
 * Backend → presentation mapping (Prompt 9A) — no React/RN import. `LeaveRequest`
 * is imported type-only from `@digihostel/api-client-react` (erased at
 * compile time, same pattern as `Href`-type-only imports elsewhere in this
 * app) — this file makes no API call and imports no runtime code from that
 * package.
 *
 * This is THE single place a real backend `LeaveRequest` becomes what the
 * UI renders. Every field the backend genuinely does not supply
 * (`leaveType`, `destination`, `expiryTimestamp`, `student`) is mapped to
 * `null` here — never fabricated — so every screen downstream only ever
 * needs to handle "value" vs. "null," never a special "is this real"
 * out-of-band flag.
 */

// Reception-Initiated Parent Approval correction: "pending" deliberately
// does NOT belong in this set. A `pending` leave request has not yet been
// sent for parent approval by Reception — the backend's own
// PARENT_DECIDABLE_STATUSES (apps/api/src/domain/leave/types.ts) excludes it
// from decide() for the identical reason. It is mapped to "not_yet_sent"
// below instead, so this app never presents an un-sent request as
// actionable.
const AWAITING_RESPONSE_STATUSES = new Set([
  "father_notified",
  "mother_notified",
  "guardian_notified",
  "in_app_call",
  "manual_verification",
]);

/** Collapses every stage a parent can actually decide on into
 * `"awaiting_response"`, and `pending` into its own dedicated
 * `"not_yet_sent"` — see `types.ts`'s doc comment on
 * `LeaveApprovalPresentationStatus` for why the raw stage is never surfaced
 * individually and why `pending` is never conflated with
 * `"awaiting_response"`. */
export function mapBackendStatus(status: string): LeaveApprovalPresentationStatus {
  if (status === "pending") return "not_yet_sent";
  if (AWAITING_RESPONSE_STATUSES.has(status)) return "awaiting_response";
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "expired") return "expired";
  return "unknown";
}

/** Accepts a `Pick` of the fields actually used, rather than the full
 * `LeaveRequest` — makes the dependency on the backend shape explicit and
 * keeps unit tests (and future dev fixtures) from needing to fabricate
 * `updatedAt`, which this presentation model doesn't use. */
export function mapLeaveRequestToPresentation(
  leaveRequest: Pick<
    LeaveRequest,
    "id" | "studentId" | "reason" | "startDate" | "endDate" | "status" | "createdAt"
  >,
): LeaveRequestPresentation {
  return {
    id: leaveRequest.id,
    // Kept only as an opaque correlation key (Prompt 11) — never rendered.
    // The rich `student` object below still requires no new data source
    // beyond what Profile's own `useLinkedStudents()` separately fetches.
    studentId: leaveRequest.studentId ?? null,
    // No student data source is wired into THIS mapper (Leave Details
    // itself doesn't show a name/hostel/room) — see
    // docs/leave-approval.md's capability matrix (students_select_linked_parent
    // RLS exists and could support this; Profile now uses it independently
    // via `services/profile/profile.ts`, Prompt 11).
    student: null,
    leaveType: null,
    destination: null,
    reason: leaveRequest.reason,
    departureDate: leaveRequest.startDate,
    expectedReturnDate: leaveRequest.endDate,
    status: mapBackendStatus(leaveRequest.status),
    createdAt: leaveRequest.createdAt,
    expiryTimestamp: null,
  };
}

/** Narrows a list of presentations to only those still awaiting a parent's
 * decision — i.e. every status `mapBackendStatus` collapses to
 * `"awaiting_response"`. Extracted as a pure, directly-testable function
 * because `usePendingApprovals()` (and every screen that calls it — the
 * Pending Approval list, the Dashboard's `PendingActionsCard`) means exactly
 * this by "pending"/"awaiting your response," not "every leave request this
 * parent's students have ever filed." Mirrors the equivalent filter
 * `useLinkedStudents.ts` already applies independently to the same raw
 * feed. */
export function filterAwaitingResponse(
  presentations: LeaveRequestPresentation[],
): LeaveRequestPresentation[] {
  return presentations.filter((presentation) => presentation.status === "awaiting_response");
}

/** Derives the screen's initial UI state purely from an already-loaded
 * presentation's status — used the moment a request is first opened, before
 * any user action. Interactive states (`confirming_approval`,
 * `processing_approval`, …) are reached only through this screen's own
 * local state transitions, never derived here. `"cancelled"` is never
 * produced — see `types.ts`'s doc comment on why. */
export function deriveUiStateFromPresentation(
  presentation: LeaveRequestPresentation,
): LeaveApprovalUiState {
  switch (presentation.status) {
    case "expired":
      return "expired";
    case "approved":
    case "rejected":
      return "already_processed";
    case "awaiting_response":
      return "loaded";
    case "not_yet_sent":
      return "not_yet_sent";
    default:
      return "unavailable";
  }
}
