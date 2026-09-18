import { useMutation, useQueryClient } from "@tanstack/react-query";
import { healthOperationsService } from "../../services/health/HealthService";
import { mapHealthError } from "./useHealthCaseQueue";
import { healthCaseDetailQueryKey } from "./useHealthCaseDetail";
import { AppError } from "../../lib/errors/errors";
import type { HealthCaseEvent } from "@digihostel/api-client-react";

export interface AddHealthCaseNoteParams {
  caseId: string;
  note: string;
}

export interface AddHealthCaseNoteState {
  addNote: (params: AddHealthCaseNoteParams) => void;
  isPending: boolean;
  error: AppError | null;
  data: HealthCaseEvent | null;
  reset: () => void;
}

export function useAddHealthCaseNote(): AddHealthCaseNoteState {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (params: AddHealthCaseNoteParams) =>
      healthOperationsService.addNote(params.caseId, params.note),
    onSettled: (_data, _error, params) => {
      void queryClient.invalidateQueries({ queryKey: healthCaseDetailQueryKey(params.caseId) });
    },
  });

  return {
    addNote: (params) => mutation.mutate(params),
    isPending: mutation.isPending,
    error: mutation.error ? mapHealthError(mutation.error) : null,
    data: mutation.data ?? null,
    reset: mutation.reset,
  };
}
