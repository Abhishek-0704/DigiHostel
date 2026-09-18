/**
 * Typed domain errors for the Enterprise Configuration Center (Phase 5,
 * Prompt 14). Mirrors `domain/staff/errors.ts`'s exact shape/discipline.
 */

export class ConfigurationDomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Anti-enumeration shape, matching every other "no such record / outside
 * scope" error in this codebase. */
export class ConfigurationNotFoundError extends ConfigurationDomainError {
  constructor(readonly entryId: string) {
    super("Configuration entry not found.", "configuration_not_found");
  }
}

/** A hostel_admin attempted to create/edit an entry outside their own
 * hostel, or a global entry (hostel_admin's authority is hostel-scoped
 * only — never trusted from the client, always the caller's own
 * server-resolved hostel id). */
export class ConfigurationHostelScopeError extends ConfigurationDomainError {
  constructor() {
    super(
      "You may only manage configuration for your own assigned hostel.",
      "configuration_hostel_scope_forbidden",
    );
  }
}

export class ConfigurationDuplicateKeyError extends ConfigurationDomainError {
  constructor(
    readonly domain: string,
    readonly key: string,
  ) {
    super(
      `A configuration entry for "${domain}.${key}" already exists at this scope.`,
      "configuration_duplicate_key",
    );
  }
}

export class ConfigurationInvalidHostelError extends ConfigurationDomainError {
  constructor() {
    super("The specified hostel does not exist.", "configuration_invalid_hostel");
  }
}

export class ConfigurationHostelRequiredError extends ConfigurationDomainError {
  constructor() {
    super(
      'A hostel-scoped entry requires a hostel id ("scope": "hostel").',
      "configuration_hostel_required",
    );
  }
}

export class ConfigurationHostelNotPermittedError extends ConfigurationDomainError {
  constructor() {
    super(
      'A global entry must not name a hostel ("scope": "global").',
      "configuration_hostel_not_permitted",
    );
  }
}

export class ConfigurationInvalidValueError extends ConfigurationDomainError {
  constructor(reason: string) {
    super(reason, "configuration_invalid_value");
  }
}

/** Optimistic-concurrency conflict — the caller's `expectedVersion` no
 * longer matches the persisted row (someone else updated it since the
 * caller last read it). */
export class ConfigurationStaleVersionError extends ConfigurationDomainError {
  constructor(readonly currentVersion: number) {
    super(
      "This configuration entry was changed by someone else since you loaded it. Reload and try again.",
      "configuration_stale_version",
    );
  }
}

export class ConfigurationValidationError extends ConfigurationDomainError {
  constructor(message: string) {
    super(message, "configuration_validation_failed");
  }
}
