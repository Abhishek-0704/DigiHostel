import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { analyticsService } from "../../services/analytics/AnalyticsService";
import { AppError, toAppError, safeMessageFor } from "../../lib/errors/errors";
import type { AnalyticsOverview } from "@digihostel/api-client-react";
import type { DateRangeValue } from "./dateRange";

function mapAnalyticsError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status: unknown }).status;
    if (status === 401)
      return new AppError("unauthenticated", safeMessageFor("unauthenticated"), err);
    if (status === 403) return new AppError("forbidden", safeMessageFor("forbidden"), err);
    if (status === 400) return new AppError("validation", safeMessageFor("validation"), err);
  }
  return toAppError(err);
}

export const ANALYTICS_OVERVIEW_QUERY_KEY = (range: DateRangeValue) =>
  ["analytics-overview", range.dateFrom, range.dateTo] as const;

export interface AnalyticsOverviewState {
  overview: AnalyticsOverview | null;
  isLoading: boolean;
  error: AppError | null;
  refresh: () => Promise<void>;
}

/**
 * Executive KPI overview (Phase 6, Prompt 15) — presence, leave, movement,
 * and notification summaries for the selected date range. Every value is
 * server-derived; this hook performs no client-side calculation of its
 * own beyond simple presentation formatting done in the component layer.
 */
export function useAnalyticsOverview(range: DateRangeValue): AnalyticsOverviewState {
  const queryClient = useQueryClient();
  const queryKey = ANALYTICS_OVERVIEW_QUERY_KEY(range);
  const query = useQuery({
    queryKey,
    queryFn: () => analyticsService.getOverview({ dateFrom: range.dateFrom, dateTo: range.dateTo }),
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  return {
    overview: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error ? mapAnalyticsError(query.error) : null,
    refresh,
  };
}

export { mapAnalyticsError };
