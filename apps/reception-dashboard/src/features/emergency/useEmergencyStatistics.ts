import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { emergencyOperationsService } from "../../services/emergency/EmergencyService";
import { mapEmergencyError } from "./useEmergencyQueue";
import { AppError } from "../../lib/errors/errors";
import type { EmergencyStatistics } from "@digihostel/api-client-react";

export const EMERGENCY_STATISTICS_QUERY_KEY = ["emergency-statistics"] as const;

export interface EmergencyStatisticsState {
  statistics: EmergencyStatistics | null;
  isLoading: boolean;
  error: AppError | null;
  refresh: () => Promise<void>;
}

/**
 * Server-derived active-incident counts for the EOC's statistics strip
 * (Phase 4, Prompt 10) — never a client-computed aggregate over the
 * paginated queue page currently in view (which would be wrong the moment
 * there is more than one page).
 */
export function useEmergencyStatistics(): EmergencyStatisticsState {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: EMERGENCY_STATISTICS_QUERY_KEY,
    queryFn: () => emergencyOperationsService.getStatistics(),
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: EMERGENCY_STATISTICS_QUERY_KEY });
  }, [queryClient]);

  return {
    statistics: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error ? mapEmergencyError(query.error) : null,
    refresh,
  };
}
