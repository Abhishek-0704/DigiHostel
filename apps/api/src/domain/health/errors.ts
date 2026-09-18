import type { HealthCaseStatus } from "./types.js";

/**
 * Typed domain errors for the Health Operations Center (Phase 4, Prompt
 * 11). Mirrors domain/emergency/errors.ts's exact shape/discipline.
 */

export class HealthDomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** A single error/response for both "no such student" and "exists but
 * outside the caller's hostel scope" — anti-enumeration, same discipline as
 * `EmergencyStudentNotFoundError`. */
export class HealthStudentNotFoundError extends HealthDomainError {
  constructor(readonly rollNumber: string) {
    super("Student not found.", "health_student_not_found");
  }
}

/** Same anti-enumeration shape, for a case id rather than a roll number —
 * used by every GET/transition/note route once a case id is the input. */
export class HealthCaseNotFoundError extends HealthDomainError {
  constructor(readonly caseId: string) {
    super("Case not found.", "health_case_not_found");
  }
}

/** The case exists and is within the caller's scope, but the requested
 * transition/note cannot be applied because its CURRENT status does not
 * permit it — the conditional-UPDATE-WHERE-status pattern's losing side,
 * mirrors `EmergencyConflictError` exactly. */
export class HealthCaseConflictError extends HealthDomainError {
  constructor(
    readonly caseId: string,
    readonly currentStatus: HealthCaseStatus,
    action: string,
  ) {
    super(
      `Case is in status "${currentStatus}" and cannot be ${action} from this state.`,
      "health_case_conflict",
    );
  }
}

export class HealthValidationError extends HealthDomainError {
  constructor(message: string) {
    super(message, "health_validation_failed");
  }
}
