import {
  getAnalyticsOverview,
  getAnalyticsLeaveTrend,
  getAnalyticsMovementTrend,
  type AnalyticsOverview,
  type AnalyticsLeaveTrend,
  type AnalyticsMovementTrend,
} from "@digihostel/api-client-react";

export interface AnalyticsRangeParams {
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Operational Intelligence & Executive Analytics Dashboard service (Phase
 * 6, Prompt 15) — thin transport wrapper, matching
 * `AuditService`/`HealthOperationsService`'s established pattern exactly.
 * The backend resolves hostel scope and the `reports:view` role boundary
 * entirely server-side from the authenticated caller's own staff identity;
 * this service performs no authorization or scoping of its own. Strictly
 * read-only: no mutation method exists on this interface, by design
 * (Prompt 15 §24).
 */
export interface AnalyticsService {
  getOverview(params: AnalyticsRangeParams): Promise<AnalyticsOverview>;
  getLeaveTrend(params: AnalyticsRangeParams): Promise<AnalyticsLeaveTrend>;
  getMovementTrend(params: AnalyticsRangeParams): Promise<AnalyticsMovementTrend>;
}

export const analyticsService: AnalyticsService = {
  async getOverview(params) {
    return getAnalyticsOverview({ dateFrom: params.dateFrom, dateTo: params.dateTo });
  },
  async getLeaveTrend(params) {
    return getAnalyticsLeaveTrend({ dateFrom: params.dateFrom, dateTo: params.dateTo });
  },
  async getMovementTrend(params) {
    return getAnalyticsMovementTrend({ dateFrom: params.dateFrom, dateTo: params.dateTo });
  },
};

export type { AnalyticsOverview, AnalyticsLeaveTrend, AnalyticsMovementTrend };
export type {
  AnalyticsPresenceSummary,
  AnalyticsLeaveOverview,
  AnalyticsMovementOverview,
  AnalyticsNotificationOverview,
  AnalyticsTrendPoint,
  AnalyticsHourBucket,
} from "@digihostel/api-client-react";
