import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { auditService } from "../../services/audit/AuditService";
import { mapAuditError } from "./useAuditLog";
import { AppError } from "../../lib/errors/errors";
import type { AuditStatistics } from "@digihostel/api-client-react";

export const AUDIT_STATISTICS_QUERY_KEY = ["audit-statistics"] as const;

export interface AuditStatisticsState {
  statistics: AuditStatistics | null;
  isLoading: boolean;
  error: AppError | null;
  refresh: () => Promise<void>;
}

/**
 * Server-derived, today-scoped event counts for the Audit Center's
 * statistics strip (Phase 5, Prompt 12) — never a client-computed
 * aggregate over the paginated page currently in view.
 */
export function useAuditStatistics(): AuditStatisticsState {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: AUDIT_STATISTICS_QUERY_KEY,
    queryFn: () => auditService.getStatistics(),
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: AUDIT_STATISTICS_QUERY_KEY });
  }, [queryClient]);

  return {
    statistics: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error ? mapAuditError(query.error) : null,
    refresh,
  };
}
