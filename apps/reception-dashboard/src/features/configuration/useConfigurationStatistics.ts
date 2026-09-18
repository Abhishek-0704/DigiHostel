import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { configurationService } from "../../services/configuration/ConfigurationService";
import { mapConfigurationError } from "./useConfigurationList";
import { AppError } from "../../lib/errors/errors";
import type { ConfigurationStatistics } from "@digihostel/api-client-react";

export const CONFIGURATION_STATISTICS_QUERY_KEY = ["configuration-statistics"] as const;

export interface ConfigurationStatisticsState {
  statistics: ConfigurationStatistics | null;
  isLoading: boolean;
  error: AppError | null;
  refresh: () => Promise<void>;
}

/** Server-derived configuration counts by domain, within the caller's own
 * hostel scope — never a client-computed aggregate over only the current
 * paginated page (mirrors `useStaffStatistics`). */
export function useConfigurationStatistics(): ConfigurationStatisticsState {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: CONFIGURATION_STATISTICS_QUERY_KEY,
    queryFn: () => configurationService.getStatistics(),
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: CONFIGURATION_STATISTICS_QUERY_KEY });
  }, [queryClient]);

  return {
    statistics: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error ? mapConfigurationError(query.error) : null,
    refresh,
  };
}
