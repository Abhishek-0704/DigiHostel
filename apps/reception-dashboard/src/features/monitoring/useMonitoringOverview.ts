import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  monitoringService,
  type MonitoringOverview,
} from "../../services/monitoring/MonitoringService";
import { AppError, toAppError, safeMessageFor } from "../../lib/errors/errors";

function mapMonitoringError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status: unknown }).status;
    if (status === 401)
      return new AppError("unauthenticated", safeMessageFor("unauthenticated"), err);
    if (status === 403) return new AppError("forbidden", safeMessageFor("forbidden"), err);
  }
  return toAppError(err);
}

export const MONITORING_OVERVIEW_QUERY_KEY = ["monitoring-overview"] as const;

export interface MonitoringOverviewState {
  overview: MonitoringOverview | null;
  isLoading: boolean;
  isFetching: boolean;
  error: AppError | null;
  refresh: () => Promise<void>;
}

/**
 * Enterprise Operations Monitoring Center overview (Phase 7, Prompt 18).
 *
 * Refresh strategy (§20/§30 — deliberate, not an oversight): NO automatic
 * polling and NO realtime subscription. Every infrastructure signal this
 * page shows is measured FRESH, server-side, on every fetch — including a
 * real round-trip to the Supabase Auth Admin API — so an aggressive
 * auto-refresh interval would create unnecessary load against an external,
 * rate-limited dependency for a super_admin-only console with no
 * legitimate need to auto-poll every few seconds. This mirrors
 * `AnalyticsPage`/`AuditPage`'s own established "manual Refresh, no
 * realtime" precedent and its stated reasoning exactly: an aggregate view
 * has no safe, non-approximated way to update incrementally from a single
 * event anyway.
 */
export function useMonitoringOverview(): MonitoringOverviewState {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: MONITORING_OVERVIEW_QUERY_KEY,
    queryFn: () => monitoringService.getOverview(),
    staleTime: 30_000,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: MONITORING_OVERVIEW_QUERY_KEY });
  }, [queryClient]);

  return {
    overview: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ? mapMonitoringError(query.error) : null,
    refresh,
  };
}

export { mapMonitoringError };
