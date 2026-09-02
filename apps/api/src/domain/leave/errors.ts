/**
 * Typed domain/service errors for the Parent Leave Approval workflow.
 * Routes map these to HTTP responses (see routes/leave.ts) — never leak a
 * raw database error or stack trace to a client.
 */

export class LeaveDomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * The leave request either does not exist, OR exists but the caller has no
 * `parent_student_relationships` link to its student. Deliberately a single
 * error/response for both cases — per this task's explicit anti-enumeration
 * requirement, a caller must not be able to distinguish "wrong ID" from
 * "right ID, not yours" by observing 404 vs 403.
 */
export class LeaveRequestNotFoundError extends LeaveDomainError {
  constructor(readonly leaveRequestId: string) {
    super("Leave request not found.", "leave_request_not_found");
  }
}

/**
 * The leave request exists and the caller IS authorized to see it (so this
 * is safe to distinguish from NotFound without an enumeration risk — the
 * caller already legitimately knows this leave request exists), but its
 * current status does not permit the requested transition: either it is
 * already in a terminal state (approved/rejected/expired) or a decision was
 * concurrently applied by another request between load and update.
 */
export class LeaveRequestConflictError extends LeaveDomainError {
  constructor(
    readonly leaveRequestId: string,
    readonly currentStatus: string,
  ) {
    super(
      `Leave request is in status "${currentStatus}" and cannot be decided.`,
      "leave_request_conflict",
    );
  }
}

/** The request body failed validation (e.g. an unrecognized decision value). */
export class LeaveValidationError extends LeaveDomainError {
  constructor(message: string) {
    super(message, "validation_failed");
  }
}

/**
 * The supplied biometric-freshness assertion was missing, malformed, or (once
 * a real provider exists) failed its freshness check. Distinct from
 * LeaveValidationError since this is a security-gate failure, not a
 * shape/type validation failure of the request body.
 */
export class LeaveBiometricConfirmationError extends LeaveDomainError {
  constructor(message: string) {
    super(message, "biometric_confirmation_required");
  }
}
