/** Typed domain errors for the Administrative Profile & Personal
 * Preferences Center (Phase 7, Prompt 17). Mirrors
 * `domain/configuration/errors.ts`'s exact shape/discipline. */

export class ProfileDomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** A caller attempted to disable a mandatory safety/security notification
 * category (`MANDATORY_NOTIFICATION_CATEGORIES`) — rejected explicitly,
 * never silently coerced back to enabled. */
export class ProfileMandatoryNotificationError extends ProfileDomainError {
  constructor(readonly category: string) {
    super(
      `The "${category}" notification category is mandatory and cannot be disabled.`,
      "profile_mandatory_notification",
    );
  }
}

export class ProfileValidationError extends ProfileDomainError {
  constructor(message: string) {
    super(message, "profile_validation_failed");
  }
}
