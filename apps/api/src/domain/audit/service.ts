import type { AuditRepository } from "./repository.js";
import type { AuditListInput, AuditListResult, AuditStatistics, StaffScopeInput } from "./types.js";

/**
 * Service boundary for the Enterprise Audit Center (Phase 5, Prompt 12) —
 * thin pass-through over the repository, matching `EmergencyService`'s/
 * `HealthService`'s established shape. Read-only: no mutation method exists
 * anywhere on this class, by design (§33 — the Audit Center is strictly
 * read-only).
 */
export class AuditService {
  constructor(private readonly repository: AuditRepository) {}

  async list(input: AuditListInput): Promise<AuditListResult> {
    return this.repository.list(input);
  }

  async getStatistics(scope: StaffScopeInput): Promise<AuditStatistics> {
    return this.repository.getStatistics(scope);
  }
}
