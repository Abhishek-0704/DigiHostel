import { useMutation, useQueryClient } from "@tanstack/react-query";
import { emergencyOperationsService } from "../../services/emergency/EmergencyService";
import { mapEmergencyError } from "./useEmergencyQueue";
import { emergencyDetailQueryKey } from "./useEmergencyDetail";
import { EMERGENCY_STATISTICS_QUERY_KEY } from "./useEmergencyStatistics";
import { AppError } from "../../lib/errors/errors";
import type { EmergencyDetail } from "@digihostel/api-client-react";

export type EmergencyTransitionAction = "acknowledge" | "startResponse" | "resolve" | "close";

const ACTION_FN: Record<
  EmergencyTransitionAction,
  (incidentId: string) => Promise<EmergencyDetail>
> = {
  acknowledge: (id) => emergencyOperationsService.acknowledge(id),
  startResponse: (id) => emergencyOperationsService.startResponse(id),
  resolve: (id) => emergencyOperationsService.resolve(id),
  close: (id) => emergencyOperationsService.close(id),
};

export interface EmergencyTransitionState {
  transition: (incidentId: string) => void;
  isPending: boolean;
  error: AppError | null;
  data: EmergencyDetail | null;
  reset: () => void;
}

/**
 * One shared mutation shape for every EOC state transition (Phase 4, Prompt
 * 10) — acknowledge/start-response/resolve/close all have the identical
 * "one atomic server command, then invalidate detail + queue + statistics"
 * behavior, mirroring `useRecordHostelReturn`'s/`useAuthorizeExit`'s
 * established pattern (never an optimistic local write). Query invalidation
 * runs in `onSettled`, not just `onSuccess`: both a genuine success and a
 * 409 conflict (a losing concurrent transition, a stale tab, or an honest
 * double-click) mean server-authoritative state may have changed since this
 * page last read it.
 */
export function useEmergencyTransition(
  action: EmergencyTransitionAction,
): EmergencyTransitionState {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (incidentId: string) => ACTION_FN[action](incidentId),
    onSettled: (_data, _error, incidentId) => {
      void queryClient.invalidateQueries({ queryKey: emergencyDetailQueryKey(incidentId) });
      void queryClient.invalidateQueries({ queryKey: ["emergency-queue"] });
      void queryClient.invalidateQueries({ queryKey: EMERGENCY_STATISTICS_QUERY_KEY });
    },
  });

  return {
    transition: (incidentId: string) => mutation.mutate(incidentId),
    isPending: mutation.isPending,
    error: mutation.error ? mapEmergencyError(mutation.error) : null,
    data: mutation.data ?? null,
    reset: mutation.reset,
  };
}
