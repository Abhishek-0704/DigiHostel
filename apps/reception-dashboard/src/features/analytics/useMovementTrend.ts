import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { analyticsService } from "../../services/analytics/AnalyticsService";
import { AppError } from "../../lib/errors/errors";
import { mapAnalyticsError } from "./useAnalyticsOverview";
import type { AnalyticsMovementTrend } from "@digihostel/api-client-react";
import type { DateRangeValue } from "./dateRange";

export const ANALYTICS_MOVEMENT_TREND_QUERY_KEY = (range: DateRangeValue) =>
  ["analytics-movement-trend", range.dateFrom, range.dateTo] as const;

export interface MovementTrendState {
  trend: AnalyticsMovementTrend | null;
  isLoading: boolean;
  error: AppError | null;
  refresh: () => Promise<void>;
}

export function useMovementTrend(range: DateRangeValue): MovementTrendState {
  const queryClient = useQueryClient();
  const queryKey = ANALYTICS_MOVEMENT_TREND_QUERY_KEY(range);
  const query = useQuery({
    queryKey,
    queryFn: () =>
      analyticsService.getMovementTrend({ dateFrom: range.dateFrom, dateTo: range.dateTo }),
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  return {
    trend: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error ? mapAnalyticsError(query.error) : null,
    refresh,
  };
}
