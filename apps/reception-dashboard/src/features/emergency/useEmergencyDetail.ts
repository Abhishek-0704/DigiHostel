import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { emergencyOperationsService } from "../../services/emergency/EmergencyService";
import { mapEmergencyError } from "./useEmergencyQueue";
import { AppError } from "../../lib/errors/errors";
import type { EmergencyDetail } from "@digihostel/api-client-react";

export const emergencyDetailQueryKey = (incidentId: string) =>
  ["emergency-detail", incidentId] as const;

export interface EmergencyDetailState {
  incident: EmergencyDetail | null;
  isLoading: boolean;
  error: AppError | null;
  refresh: () => Promise<void>;
}

/**
 * Server-state layer for a single incident's detail view (Phase 4, Prompt
 * 10) — matches `useStudentProfile`'s established single-record shape.
 */
export function useEmergencyDetail(incidentId: string | undefined): EmergencyDetailState {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: emergencyDetailQueryKey(incidentId ?? ""),
    queryFn: () => emergencyOperationsService.getById(incidentId!),
    enabled: Boolean(incidentId),
  });

  const refresh = useCallback(async () => {
    if (!incidentId) return;
    await queryClient.invalidateQueries({ queryKey: emergencyDetailQueryKey(incidentId) });
  }, [queryClient, incidentId]);

  return {
    incident: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error ? mapEmergencyError(query.error) : null,
    refresh,
  };
}
