/**
 * Leave Approval presentation types (Prompt 9A) — no React/RN import.
 *
 * Deliberately a distinct, narrow presentation model — never the backend's
 * own `LeaveRequest`/`LeaveRequestView` type re-exported as-is (mirrors that
 * backend type's own doc comment: "a distinct, narrow view type... so a
 * future column addition doesn't automatically leak into the API without a
 * deliberate decision" — the same discipline applies one layer further out,
 * client-side). `leavePresentationMapper.ts` is the one place a backend
 * `LeaveRequest` becomes a `LeaveRequestPresentation`.
 *
 * UI state vs. backend state: `LeaveApprovalUiState` is what this SCREEN is
 * currently showing (a presentation concept) — it is never confused with
 * `LeaveApprovalPresentationStatus`, which reflects the backend's own
 * authoritative `leave_requests.status` (collapsed into a coarser,
 * safe-to-render vocabulary — see `leavePresentationMapper.ts`'s doc
 * comment on why the raw escalation stage is never surfaced). Only the
 * backend can ever move a real request between statuses; this app's UI
 * states are for THIS screen's own presentation flow only.
 */

/** Presentation states this screen can render. Distinct from
 * `LeaveApprovalPresentationStatus` — see this file's own doc comment.
 * `"cancelled"` is kept in this type for completeness/documentation only:
 * no cancellation concept exists anywhere in the backend's
 * `leave_request_status` enum today (`packages/db/src/schema/enums.ts`), so
 * `deriveUiStateFromPresentation()` never produces it — see
 * `leavePresentationMapper.ts`. */
export type LeaveApprovalUiState =
  | "loading"
  | "loaded"
  | "confirming_approval"
  | "confirming_rejection"
  | "preparing_verification"
  | "processing_approval"
  | "processing_rejection"
  | "approval_success"
  | "rejection_success"
  | "expired"
  | "already_processed"
  | "cancelled"
  | "not_yet_sent"
  | "unavailable"
  | "error";

/**
 * A safe, coarse status vocabulary derived from the backend's real
 * `leave_request_status` enum. `"awaiting_response"` deliberately collapses
 * every stage a parent can actually decide on (`father_notified`,
 * `mother_notified`, `guardian_notified`, `in_app_call`,
 * `manual_verification` — `PARENT_DECIDABLE_STATUSES`,
 * `apps/api/src/domain/leave/types.ts`) into one value: which stage a
 * request is at is internal escalation detail this app must never surface
 * (the same principle already established for notifications —
 * `docs/notifications.md` §1's "never expose internal escalation details").
 * `"not_yet_sent"` is `pending` on its own — Reception-Initiated Parent
 * Approval correction: a `pending` request has not yet been sent for parent
 * approval by Reception and is deliberately NOT actionable, so it must never
 * collapse into `"awaiting_response"` (which this app's Pending Approvals
 * list/Dashboard card/Leave Detail all treat as "the parent can act now").
 * `"unknown"` is a defensive fallback for a status value this presentation
 * layer doesn't recognize — never silently treated as any specific real
 * status. */
export type LeaveApprovalPresentationStatus =
  "not_yet_sent" | "awaiting_response" | "approved" | "rejected" | "expired" | "unknown";

export interface StudentPresentation {
  name: string | null;
  rollNumber: string | null;
  hostel: string | null;
  room: string | null;
}

/**
 * The full presentation model a Leave Details screen renders from. Every
 * field the current backend genuinely cannot supply is explicitly typed
 * `null`-capable and IS `null` in every mapping this prompt produces — never
 * a fabricated placeholder value. See `leavePresentationMapper.ts`'s doc
 * comment for exactly which fields are real vs. structurally absent today.
 */
export interface LeaveRequestPresentation {
  /** Opaque key/nav-param only — never rendered as visible text. */
  id: string;
  /** Opaque correlation key only — never rendered as visible text. Added in
   * Prompt 11 so Profile's Linked Student summary can correlate a leave
   * request back to a specific linked student without a second leave-data
   * source (`docs/profile.md` §1) — `student` below remains the
   * (still-unpopulated) rich presentation object for the Leave Details
   * screen itself. */
  studentId: string | null;
  student: StudentPresentation | null;
  /** NOT in the backend model (`leave_requests` has no `leave_type`
   * column, and no SDD/ADR text defines one — `docs/leave-approval-workflow.md`).
   * Always `null` today. */
  leaveType: string | null;
  /** NOT in the backend model (`leave_requests` has no `destination`
   * column — confirmed absent by design, `docs/leave-approval-workflow.md`
   * line 79). Always `null` today. */
  destination: string | null;
  reason: string | null;
  /** ISO calendar date (`YYYY-MM-DD`, no time component — the backend
   * column is `date`, not `timestamp`). */
  departureDate: string | null;
  /** Same shape/caveat as `departureDate`. */
  expectedReturnDate: string | null;
  status: LeaveApprovalPresentationStatus;
  createdAt: string | null;
  /** NOT in the backend API response (`serialize()`,
   * `apps/api/src/routes/leave.ts`, returns exactly 8 fields, none of them
   * an expiry timestamp). Always `null` today — see `CountdownTimer`'s own
   * "missing timestamp" presentation. */
  expiryTimestamp: string | null;
}

export type LeaveTimelineEventStatus = "completed" | "current" | "upcoming";

export interface LeaveTimelineEvent {
  id: string;
  label: string;
  status: LeaveTimelineEventStatus;
  /** `null` when this event's status is known but no real timestamp exists
   * for it yet (e.g. an "upcoming" step). */
  timestamp: string | null;
}

export type CountdownUrgency = "normal" | "warning" | "critical" | "expired" | "unavailable";

export interface CountdownPresentation {
  urgency: CountdownUrgency;
  /** Short, visible label — e.g. "2h 15m remaining". */
  label: string;
  /** Fuller sentence for screen readers. */
  accessibleLabel: string;
}
