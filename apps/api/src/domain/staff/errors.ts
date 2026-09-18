/**
 * Typed domain errors for the Identity & Access Administration Center
 * (Phase 5, Prompt 13). Mirrors `domain/emergency/errors.ts`'s exact
 * shape/discipline.
 */

export class StaffAdminDomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Anti-enumeration shape, matching every other "no such record / outside
 * scope" error in this codebase. Since this domain is super_admin-only and
 * unscoped by hostel (super_admin sees every staff row), the only real
 * cause is "no such staff id" — kept as a single error type regardless,
 * for consistency with the established pattern. */
export class StaffNotFoundError extends StaffAdminDomainError {
  constructor(readonly staffId: string) {
    super("Staff member not found.", "staff_not_found");
  }
}

/** §12's explicit self-escalation defense: no admin mutation route in this
 * domain ever targets the acting super_admin's own staff id. */
export class StaffSelfTargetError extends StaffAdminDomainError {
  constructor() {
    super(
      "You cannot perform this administrative action on your own account.",
      "staff_self_target_forbidden",
    );
  }
}

/** §12's explicit "the last active super_admin cannot be demoted or
 * suspended" defense — verified via a real COUNT query in the same
 * transaction as the mutation, not assumed. */
export class StaffLastSuperAdminError extends StaffAdminDomainError {
  constructor(action: string) {
    super(
      `Cannot ${action} the only remaining active super_admin — the system would have no administrator left.`,
      "staff_last_super_admin_protected",
    );
  }
}

export class StaffDuplicateEmailError extends StaffAdminDomainError {
  constructor(readonly email: string) {
    super("A staff account with this email already exists.", "staff_duplicate_email");
  }
}

export class StaffInvalidHostelError extends StaffAdminDomainError {
  constructor(readonly hostelId: string) {
    super("The specified hostel does not exist.", "staff_invalid_hostel");
  }
}

/** `library_incharge`/`super_admin` are legitimately unscoped (`hostel_id`
 * null) — but `reception_warden`/`hostel_admin` require a real hostel
 * assignment, matching the existing `staff.hostel_id` semantics already
 * established by seed data throughout this schema. */
export class StaffHostelRequiredError extends StaffAdminDomainError {
  constructor(role: string) {
    super(`Role "${role}" requires a hostel assignment.`, "staff_hostel_required");
  }
}

export class StaffValidationError extends StaffAdminDomainError {
  constructor(message: string) {
    super(message, "staff_validation_failed");
  }
}
