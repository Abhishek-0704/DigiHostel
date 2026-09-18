import type { HealthRepository } from "./repository.js";
import type {
  HealthCaseListInput,
  HealthCaseListResult,
  HealthCaseDetailView,
  HealthCaseStatistics,
  HealthCaseCreateInput,
  HealthCaseTransitionInput,
  HealthCaseNoteInput,
  HealthCaseEventView,
  StaffScopeInput,
  HealthCaseTransitionAction,
} from "./types.js";
import {
  HealthStudentNotFoundError,
  HealthCaseNotFoundError,
  HealthCaseConflictError,
} from "./errors.js";

/**
 * Service boundary for the Health Operations Center (Phase 4, Prompt 11) —
 * thin pass-through over the repository, mirroring `EmergencyService`'s own
 * shape. The only logic beyond delegation is turning a repository outcome
 * into the typed error the route maps to the correct HTTP status.
 */
export class HealthService {
  constructor(private readonly repository: HealthRepository) {}

  async list(input: HealthCaseListInput): Promise<HealthCaseListResult> {
    return this.repository.list(input);
  }

  async getStatistics(scope: StaffScopeInput): Promise<HealthCaseStatistics> {
    return this.repository.getStatistics(scope);
  }

  async getById(caseId: string, scope: StaffScopeInput): Promise<HealthCaseDetailView> {
    const healthCase = await this.repository.getById(caseId, scope);
    if (!healthCase) throw new HealthCaseNotFoundError(caseId);
    return healthCase;
  }

  async create(input: HealthCaseCreateInput): Promise<HealthCaseDetailView> {
    const outcome = await this.repository.create(input);
    if (outcome.kind === "student_not_found") {
      throw new HealthStudentNotFoundError(input.rollNumber);
    }
    return outcome.healthCase;
  }

  async transition(
    action: HealthCaseTransitionAction,
    input: HealthCaseTransitionInput,
  ): Promise<HealthCaseDetailView> {
    const outcome = await this.repository.transition(action, input);
    if (outcome.kind === "not_found") {
      throw new HealthCaseNotFoundError(input.caseId);
    }
    if (outcome.kind === "conflict") {
      throw new HealthCaseConflictError(input.caseId, outcome.currentStatus, action);
    }
    return outcome.healthCase;
  }

  async addNote(input: HealthCaseNoteInput): Promise<HealthCaseEventView> {
    const outcome = await this.repository.addNote(input);
    if (outcome.kind === "not_found") {
      throw new HealthCaseNotFoundError(input.caseId);
    }
    if (outcome.kind === "conflict") {
      throw new HealthCaseConflictError(input.caseId, outcome.currentStatus, "note_added");
    }
    return outcome.event;
  }
}
