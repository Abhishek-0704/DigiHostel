import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { healthOperationsService } from "../../services/health/HealthService";
import { mapHealthError } from "./useHealthCaseQueue";
import { AppError } from "../../lib/errors/errors";
import type { HealthCaseStatistics } from "@digihostel/api-client-react";

export const HEALTH_CASE_STATISTICS_QUERY_KEY = ["health-case-statistics"] as const;

export interface HealthCaseStatisticsState {
  statistics: HealthCaseStatistics | null;
  isLoading: boolean;
  error: AppError | null;
  refresh: () => Promise<void>;
}

/**
 * Server-derived case counts for the Health Operations Center's statistics
 * strip (Phase 4, Prompt 11) — never a client-computed aggregate over the
 * paginated queue page currently in view.
 */
export function useHealthCaseStatistics(): HealthCaseStatisticsState {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: HEALTH_CASE_STATISTICS_QUERY_KEY,
    queryFn: () => healthOperationsService.getStatistics(),
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: HEALTH_CASE_STATISTICS_QUERY_KEY });
  }, [queryClient]);

  return {
    statistics: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error ? mapHealthError(query.error) : null,
    refresh,
  };
}
