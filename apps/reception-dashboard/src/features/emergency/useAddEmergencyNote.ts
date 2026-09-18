import { useMutation, useQueryClient } from "@tanstack/react-query";
import { emergencyOperationsService } from "../../services/emergency/EmergencyService";
import { mapEmergencyError } from "./useEmergencyQueue";
import { emergencyDetailQueryKey } from "./useEmergencyDetail";
import { AppError } from "../../lib/errors/errors";
import type { EmergencyEvent } from "@digihostel/api-client-react";

export interface AddEmergencyNoteParams {
  incidentId: string;
  note: string;
}

export interface AddEmergencyNoteState {
  addNote: (params: AddEmergencyNoteParams) => void;
  isPending: boolean;
  error: AppError | null;
  data: EmergencyEvent | null;
  reset: () => void;
}

export function useAddEmergencyNote(): AddEmergencyNoteState {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (params: AddEmergencyNoteParams) =>
      emergencyOperationsService.addNote(params.incidentId, params.note),
    onSettled: (_data, _error, params) => {
      void queryClient.invalidateQueries({ queryKey: emergencyDetailQueryKey(params.incidentId) });
    },
  });

  return {
    addNote: (params) => mutation.mutate(params),
    isPending: mutation.isPending,
    error: mutation.error ? mapEmergencyError(mutation.error) : null,
    data: mutation.data ?? null,
    reset: mutation.reset,
  };
}
