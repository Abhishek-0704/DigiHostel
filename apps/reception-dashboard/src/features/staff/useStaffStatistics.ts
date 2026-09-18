import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { staffAdminService } from "../../services/staff/StaffService";
import { mapStaffError } from "./useStaffDirectory";
import { AppError } from "../../lib/errors/errors";
import type { StaffStatistics } from "@digihostel/api-client-react";

export const STAFF_STATISTICS_QUERY_KEY = ["staff-statistics"] as const;

export interface StaffStatisticsState {
  statistics: StaffStatistics | null;
  isLoading: boolean;
  error: AppError | null;
  refresh: () => Promise<void>;
}

/** Server-derived staff counts by role/status — never a client-computed
 * aggregate over only the current paginated page (mirrors
 * `useAuditStatistics`). */
export function useStaffStatistics(): StaffStatisticsState {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: STAFF_STATISTICS_QUERY_KEY,
    queryFn: () => staffAdminService.getStatistics(),
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: STAFF_STATISTICS_QUERY_KEY });
  }, [queryClient]);

  return {
    statistics: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error ? mapStaffError(query.error) : null,
    refresh,
  };
}
