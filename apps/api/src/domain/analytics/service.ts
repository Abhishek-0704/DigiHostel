import type { AnalyticsRepository } from "./repository.js";
import type {
  AnalyticsQueryInput,
  AnalyticsOverview,
  LeaveTrendResult,
  MovementTrendResult,
} from "./types.js";

/**
 * Service boundary for the Operational Intelligence & Executive Analytics
 * Dashboard (Phase 6, Prompt 15) — thin pass-through over the repository,
 * matching every other domain's established shape (`EmergencyService`,
 * `HealthService`, `AuditRepository`'s direct route consumption). No
 * business logic beyond delegation: every calculation lives in the
 * repository's own aggregate queries, and there are no typed domain errors
 * to map here since this domain has no mutation outcomes to unwrap — it is
 * read-only by construction (Prompt 15 §24).
 */
export class AnalyticsService {
  constructor(private readonly repository: AnalyticsRepository) {}

  async getOverview(input: AnalyticsQueryInput): Promise<AnalyticsOverview> {
    return this.repository.getOverview(input);
  }

  async getLeaveTrend(input: AnalyticsQueryInput): Promise<LeaveTrendResult> {
    return this.repository.getLeaveTrend(input);
  }

  async getMovementTrend(input: AnalyticsQueryInput): Promise<MovementTrendResult> {
    return this.repository.getMovementTrend(input);
  }
}
