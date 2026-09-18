/**
 * Typed domain errors for the Movement Engine (Phase 4, Prompt 9). Mirrors
 * domain/leave/errors.ts's exact shape/discipline.
 */

export class MovementDomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * The leave request either does not exist, OR exists but is outside the
 * caller's authorized hostel scope. A single error/response for both cases
 * — anti-enumeration, same discipline as `LeaveRequestNotFoundError`/
 * `StudentNotFoundError`.
 */
export class MovementLeaveRequestNotFoundError extends MovementDomainError {
  constructor(readonly leaveRequestId: string) {
    super("Leave request not found.", "movement_leave_request_not_found");
  }
}

/**
 * The leave request exists and is within the caller's scope (safe to
 * distinguish from NotFound, same reasoning as
 * `ExitAuthorizationConflictError`), but a hostel return cannot be
 * recorded for it: either the leave is not `approved`, no exit
 * authorization exists for it yet (the student was never actually marked
 * as exited), or a return has already been recorded (duplicate/replay —
 * the UNIQUE(leave_request_id, movement_type) constraint on `movements` is
 * the actual database-enforced backstop this error surfaces after the
 * fact for a losing concurrent caller or an honest repeat click).
 */
export class MovementConflictError extends MovementDomainError {
  constructor(
    readonly leaveRequestId: string,
    readonly reason: "not_eligible" | "already_returned",
    readonly currentStatus?: string,
  ) {
    super(
      reason === "already_returned"
        ? "A hostel return has already been recorded for this leave request."
        : `Leave request${currentStatus ? ` is in status "${currentStatus}"` : " has not been exit-authorized"} and is not eligible for a hostel return — parent approval and exit authorization must both be complete first.`,
      "movement_conflict",
    );
  }
}
