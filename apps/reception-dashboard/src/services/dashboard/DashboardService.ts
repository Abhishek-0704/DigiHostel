/**
 * Service boundary (Prompt 0.2 §18) — interface only, no implementation.
 * Dashboard Home composes data from other services (LeaveService,
 * StudentService, EmergencyService, etc.) rather than owning its own data
 * source — this interface exists as the aggregation contract those
 * services will be composed behind, once they themselves are implemented.
 */
export interface DashboardSummary {
  pendingApprovalsCount: number;
}

export interface DashboardService {
  getSummary(): Promise<DashboardSummary>;
}
