/**
 * Typed domain errors for the Student Operations Center (Phase 4, Prompt 8).
 * Mirrors domain/leave/errors.ts's exact shape/discipline — routes map these
 * to HTTP responses, never leaking a raw database error or stack trace.
 */

export class StudentDomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * The roll number either does not exist, OR exists but is outside the
 * caller's authorized hostel scope. Deliberately a single error/response for
 * both cases — anti-enumeration, same discipline as
 * `LeaveRequestNotFoundError` (domain/leave/errors.ts): a caller must not be
 * able to distinguish "no such student" from "real student, not yours" by
 * observing a different response.
 */
export class StudentNotFoundError extends StudentDomainError {
  constructor(readonly rollNumber: string) {
    super("Student not found.", "student_not_found");
  }
}

/** The request's query parameters failed validation (e.g. an out-of-range
 * page size or an unrecognized sort field). */
export class StudentValidationError extends StudentDomainError {
  constructor(message: string) {
    super(message, "validation_failed");
  }
}
