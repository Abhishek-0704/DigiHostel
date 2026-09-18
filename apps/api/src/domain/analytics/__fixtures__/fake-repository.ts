import type { AnalyticsRepository } from "../repository.js";
import type {
  AnalyticsQueryInput,
  AnalyticsOverview,
  PresenceSummary,
  LeaveTrendResult,
  MovementTrendResult,
} from "../types.js";

/**
 * In-memory fake, mirroring `FakeEmergencyRepository`/`FakeHealthRepository`'s
 * established shape — used by routes/analytics.test.ts to exercise the
 * route/auth/hostel-scope/date-validation layer without a real Postgres
 * connection. The real aggregate-query behavior is exercised separately by
 * repository.integration.test.ts.
 */
export class FakeAnalyticsRepository implements AnalyticsRepository {
  presenceByScope = new Map<string, PresenceSummary>();
  overviewCalls: AnalyticsQueryInput[] = [];
  leaveTrendCalls: AnalyticsQueryInput[] = [];
  movementTrendCalls: AnalyticsQueryInput[] = [];
  nextOverview: AnalyticsOverview = {
    periodFrom: "2026-01-01T00:00:00.000Z",
    periodTo: "2026-01-07T23:59:59.999Z",
    presence: { totalStudents: 0, studentsInside: 0, studentsOutside: 0 },
    leave: {
      pendingNow: 0,
      createdInPeriod: 0,
      approvedInPeriod: 0,
      rejectedInPeriod: 0,
      expiredInPeriod: 0,
      approvalRate: null,
      avgResponseMinutes: null,
    },
    movement: { returnsInPeriod: 0, avgDurationMinutes: null },
    notifications: { generatedInPeriod: 0, deliveredInPeriod: 0, failedInPeriod: 0 },
  };
  nextLeaveTrend: LeaveTrendResult = {
    periodFrom: "2026-01-01T00:00:00.000Z",
    periodTo: "2026-01-07T23:59:59.999Z",
    createdByDay: [],
    approvedByDay: [],
    rejectedByDay: [],
  };
  nextMovementTrend: MovementTrendResult = {
    periodFrom: "2026-01-01T00:00:00.000Z",
    periodTo: "2026-01-07T23:59:59.999Z",
    returnsByDay: [],
    returnsByHour: [],
  };

  async getPresence(scope: {
    staffId: string;
    staffRole: "hostel_admin" | "super_admin";
  }): Promise<PresenceSummary> {
    return (
      this.presenceByScope.get(scope.staffId) ?? {
        totalStudents: 0,
        studentsInside: 0,
        studentsOutside: 0,
      }
    );
  }

  async getOverview(input: AnalyticsQueryInput): Promise<AnalyticsOverview> {
    this.overviewCalls.push(input);
    return { ...this.nextOverview, periodFrom: input.dateFrom, periodTo: input.dateTo };
  }

  async getLeaveTrend(input: AnalyticsQueryInput): Promise<LeaveTrendResult> {
    this.leaveTrendCalls.push(input);
    return { ...this.nextLeaveTrend, periodFrom: input.dateFrom, periodTo: input.dateTo };
  }

  async getMovementTrend(input: AnalyticsQueryInput): Promise<MovementTrendResult> {
    this.movementTrendCalls.push(input);
    return { ...this.nextMovementTrend, periodFrom: input.dateFrom, periodTo: input.dateTo };
  }
}
