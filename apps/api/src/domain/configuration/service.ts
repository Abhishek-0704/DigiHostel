import type { ConfigurationRepository } from "./repository.js";
import type {
  ConfigurationListInput,
  ConfigurationListResult,
  ConfigurationStatisticsView,
  ConfigurationEntryView,
  ConfigurationCreateInput,
  ConfigurationUpdateInput,
  ConfigurationValidateInput,
  ConfigurationValidateOutcome,
} from "./types.js";
import {
  ConfigurationNotFoundError,
  ConfigurationHostelScopeError,
  ConfigurationDuplicateKeyError,
  ConfigurationInvalidHostelError,
  ConfigurationHostelRequiredError,
  ConfigurationHostelNotPermittedError,
  ConfigurationInvalidValueError,
  ConfigurationStaleVersionError,
} from "./errors.js";

/**
 * Service boundary for the Enterprise Configuration Center (Phase 5,
 * Prompt 14) — thin pass-through over the repository, matching
 * `StaffAdminService`'s established shape. The only logic beyond delegation
 * is turning a repository outcome into the typed error the route maps to
 * the correct HTTP status.
 */
export class ConfigurationService {
  constructor(private readonly repository: ConfigurationRepository) {}

  async list(input: ConfigurationListInput): Promise<ConfigurationListResult> {
    return this.repository.list(input);
  }

  async getStatistics(
    actingRole: "hostel_admin" | "super_admin",
    actingHostelId: string | null,
  ): Promise<ConfigurationStatisticsView> {
    return this.repository.getStatistics(actingRole, actingHostelId);
  }

  async getById(
    entryId: string,
    actingRole: "hostel_admin" | "super_admin",
    actingHostelId: string | null,
  ): Promise<ConfigurationEntryView> {
    const found = await this.repository.getById(entryId, actingRole, actingHostelId);
    if (!found) throw new ConfigurationNotFoundError(entryId);
    return found;
  }

  async validate(input: ConfigurationValidateInput): Promise<ConfigurationValidateOutcome> {
    return this.repository.validateFull(input);
  }

  async create(input: ConfigurationCreateInput): Promise<ConfigurationEntryView> {
    const outcome = await this.repository.create(input);
    if (outcome.kind === "hostel_scope_forbidden") throw new ConfigurationHostelScopeError();
    if (outcome.kind === "duplicate_key") {
      throw new ConfigurationDuplicateKeyError(input.domain, input.key);
    }
    if (outcome.kind === "invalid_hostel") throw new ConfigurationInvalidHostelError();
    if (outcome.kind === "hostel_required_for_scope") throw new ConfigurationHostelRequiredError();
    if (outcome.kind === "hostel_not_permitted_for_scope") {
      throw new ConfigurationHostelNotPermittedError();
    }
    if (outcome.kind === "invalid_value") {
      throw new ConfigurationInvalidValueError("The value does not match the declared value type.");
    }
    return outcome.entry;
  }

  async update(input: ConfigurationUpdateInput): Promise<ConfigurationEntryView> {
    const outcome = await this.repository.update(input);
    if (outcome.kind === "not_found") throw new ConfigurationNotFoundError(input.entryId);
    if (outcome.kind === "hostel_scope_forbidden") throw new ConfigurationHostelScopeError();
    if (outcome.kind === "stale_version") {
      throw new ConfigurationStaleVersionError(outcome.currentVersion);
    }
    if (outcome.kind === "invalid_value") {
      throw new ConfigurationInvalidValueError(
        "The value does not match the entry's declared value type.",
      );
    }
    return outcome.entry;
  }
}
