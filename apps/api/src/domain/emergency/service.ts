import type { EmergencyRepository } from "./repository.js";
import type {
  EmergencyListInput,
  EmergencyListResult,
  EmergencyDetailView,
  EmergencyStatistics,
  EmergencyCreateInput,
  EmergencyTransitionInput,
  EmergencyNoteInput,
  EmergencyEventView,
  StaffScopeInput,
  EmergencyTransitionAction,
} from "./types.js";
import {
  EmergencyStudentNotFoundError,
  EmergencyIncidentNotFoundError,
  EmergencyConflictError,
} from "./errors.js";

/**
 * Service boundary for the Emergency Operations Center (Phase 4, Prompt 10)
 * — thin pass-through over the repository, mirroring `StudentService`'s/
 * `MovementService`'s own shape. The only logic beyond delegation is turning
 * a repository outcome into the typed error the route maps to the correct
 * HTTP status.
 */
export class EmergencyService {
  constructor(private readonly repository: EmergencyRepository) {}

  async list(input: EmergencyListInput): Promise<EmergencyListResult> {
    return this.repository.list(input);
  }

  async getStatistics(scope: StaffScopeInput): Promise<EmergencyStatistics> {
    return this.repository.getStatistics(scope);
  }

  async getById(incidentId: string, scope: StaffScopeInput): Promise<EmergencyDetailView> {
    const incident = await this.repository.getById(incidentId, scope);
    if (!incident) throw new EmergencyIncidentNotFoundError(incidentId);
    return incident;
  }

  async create(input: EmergencyCreateInput): Promise<EmergencyDetailView> {
    const outcome = await this.repository.create(input);
    if (outcome.kind === "student_not_found") {
      throw new EmergencyStudentNotFoundError(input.rollNumber);
    }
    return outcome.incident;
  }

  async transition(
    action: EmergencyTransitionAction,
    input: EmergencyTransitionInput,
  ): Promise<EmergencyDetailView> {
    const outcome = await this.repository.transition(action, input);
    if (outcome.kind === "not_found") {
      throw new EmergencyIncidentNotFoundError(input.incidentId);
    }
    if (outcome.kind === "conflict") {
      throw new EmergencyConflictError(input.incidentId, outcome.currentStatus, action);
    }
    return outcome.incident;
  }

  async addNote(input: EmergencyNoteInput): Promise<EmergencyEventView> {
    const outcome = await this.repository.addNote(input);
    if (outcome.kind === "not_found") {
      throw new EmergencyIncidentNotFoundError(input.incidentId);
    }
    if (outcome.kind === "conflict") {
      throw new EmergencyConflictError(input.incidentId, outcome.currentStatus, "note_added");
    }
    return outcome.event;
  }
}
