import { useMutation, useQueryClient } from "@tanstack/react-query";
import { healthOperationsService } from "../../services/health/HealthService";
import { mapHealthError } from "./useHealthCaseQueue";
import { healthCaseDetailQueryKey } from "./useHealthCaseDetail";
import { HEALTH_CASE_STATISTICS_QUERY_KEY } from "./useHealthCaseStatistics";
import { AppError } from "../../lib/errors/errors";
import type { HealthCaseDetail } from "@digihostel/api-client-react";

export type HealthCaseTransitionAction =
  | "acknowledge"
  | "cancel"
  | "startMonitoring"
  | "markAwaitingUpdate"
  | "resumeMonitoring"
  | "resolve"
  | "discharge"
  | "close";

const ACTION_FN: Record<HealthCaseTransitionAction, (caseId: string) => Promise<HealthCaseDetail>> =
  {
    acknowledge: (id) => healthOperationsService.acknowledge(id),
    cancel: (id) => healthOperationsService.cancel(id),
    startMonitoring: (id) => healthOperationsService.startMonitoring(id),
    markAwaitingUpdate: (id) => healthOperationsService.markAwaitingUpdate(id),
    resumeMonitoring: (id) => healthOperationsService.resumeMonitoring(id),
    resolve: (id) => healthOperationsService.resolve(id),
    discharge: (id) => healthOperationsService.discharge(id),
    close: (id) => healthOperationsService.close(id),
  };

export interface HealthCaseTransitionState {
  transition: (caseId: string) => void;
  isPending: boolean;
  error: AppError | null;
  data: HealthCaseDetail | null;
  reset: () => void;
}

/**
 * One shared mutation shape for every Health Operations Center state
 * transition (Phase 4, Prompt 11) — mirrors `useEmergencyTransition`'s
 * established pattern (never an optimistic local write). Query invalidation
 * runs in `onSettled`, not just `onSuccess`.
 */
export function useHealthCaseTransition(
  action: HealthCaseTransitionAction,
): HealthCaseTransitionState {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (caseId: string) => ACTION_FN[action](caseId),
    onSettled: (_data, _error, caseId) => {
      void queryClient.invalidateQueries({ queryKey: healthCaseDetailQueryKey(caseId) });
      void queryClient.invalidateQueries({ queryKey: ["health-case-queue"] });
      void queryClient.invalidateQueries({ queryKey: HEALTH_CASE_STATISTICS_QUERY_KEY });
    },
  });

  return {
    transition: (caseId: string) => mutation.mutate(caseId),
    isPending: mutation.isPending,
    error: mutation.error ? mapHealthError(mutation.error) : null,
    data: mutation.data ?? null,
    reset: mutation.reset,
  };
}
