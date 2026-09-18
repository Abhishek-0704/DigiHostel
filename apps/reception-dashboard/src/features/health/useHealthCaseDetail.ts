import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { healthOperationsService } from "../../services/health/HealthService";
import { mapHealthError } from "./useHealthCaseQueue";
import { AppError } from "../../lib/errors/errors";
import type { HealthCaseDetail } from "@digihostel/api-client-react";

export const healthCaseDetailQueryKey = (caseId: string) => ["health-case-detail", caseId] as const;

export interface HealthCaseDetailState {
  healthCase: HealthCaseDetail | null;
  isLoading: boolean;
  error: AppError | null;
  refresh: () => Promise<void>;
}

/**
 * Server-state layer for a single case's detail view (Phase 4, Prompt 11) —
 * matches `useEmergencyDetail`'s established single-record shape.
 */
export function useHealthCaseDetail(caseId: string | undefined): HealthCaseDetailState {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: healthCaseDetailQueryKey(caseId ?? ""),
    queryFn: () => healthOperationsService.getById(caseId!),
    enabled: Boolean(caseId),
  });

  const refresh = useCallback(async () => {
    if (!caseId) return;
    await queryClient.invalidateQueries({ queryKey: healthCaseDetailQueryKey(caseId) });
  }, [queryClient, caseId]);

  return {
    healthCase: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error ? mapHealthError(query.error) : null,
    refresh,
  };
}
