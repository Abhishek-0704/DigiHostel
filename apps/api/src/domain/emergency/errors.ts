import type { EmergencyStatus } from "./types.js";

/**
 * Typed domain errors for the Emergency Operations Center (Phase 4, Prompt
 * 10). Mirrors domain/movement/errors.ts's/domain/student/errors.ts's exact
 * shape/discipline.
 */

export class EmergencyDomainError extends Error {
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
 * `StudentNotFoundError`/`MovementLeaveRequestNotFoundError`. */
export class EmergencyStudentNotFoundError extends EmergencyDomainError {
  constructor(readonly rollNumber: string) {
    super("Student not found.", "emergency_student_not_found");
  }
}

/** Same anti-enumeration shape, for an incident id rather than a roll
 * number — used by every GET/transition/note route once an incident id is
 * the input. */
export class EmergencyIncidentNotFoundError extends EmergencyDomainError {
  constructor(readonly incidentId: string) {
    super("Incident not found.", "emergency_incident_not_found");
  }
}

/** The incident exists and is within the caller's scope, but the requested
 * transition/note cannot be applied because its CURRENT status does not
 * permit it — the conditional-UPDATE-WHERE-status pattern's losing side,
 * mirrors `MovementConflictError`/leave's `decide()` 409 shape exactly. */
export class EmergencyConflictError extends EmergencyDomainError {
  constructor(
    readonly incidentId: string,
    readonly currentStatus: EmergencyStatus,
    action: string,
  ) {
    super(
      `Incident is in status "${currentStatus}" and cannot be ${action} from this state.`,
      "emergency_conflict",
    );
  }
}

export class EmergencyValidationError extends EmergencyDomainError {
  constructor(message: string) {
    super(message, "emergency_validation_failed");
  }
}
