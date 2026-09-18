import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  emergencyOperationsService,
  type ReportEmergencyParams,
} from "../../services/emergency/EmergencyService";
import { mapEmergencyError } from "./useEmergencyQueue";
import { EMERGENCY_STATISTICS_QUERY_KEY } from "./useEmergencyStatistics";
import { AppError, safeMessageFor, toAppError } from "../../lib/errors/errors";
import type { EmergencyDetail } from "@digihostel/api-client-react";

function mapReportEmergencyError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status: unknown }).status;
    if (status === 404) return new AppError("not_found", safeMessageFor("not_found"), err);
  }
  return mapEmergencyError(err) ?? toAppError(err);
}

export interface ReportEmergencyState {
  report: (params: ReportEmergencyParams) => void;
  isPending: boolean;
  error: AppError | null;
  data: EmergencyDetail | null;
  reset: () => void;
}

/**
 * The mutation behind the Report Emergency form (Student Profile's real
 * "Report Emergency" quick action — Phase 4, Prompt 10). One atomic server
 * command; invalidates the queue + statistics so the EOC reflects the new
 * incident immediately, even without waiting for the realtime subscription.
 */
export function useReportEmergency(): ReportEmergencyState {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (params: ReportEmergencyParams) => emergencyOperationsService.report(params),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["emergency-queue"] });
      void queryClient.invalidateQueries({ queryKey: EMERGENCY_STATISTICS_QUERY_KEY });
    },
  });

  return {
    report: (params) => mutation.mutate(params),
    isPending: mutation.isPending,
    error: mutation.error ? mapReportEmergencyError(mutation.error) : null,
    data: mutation.data ?? null,
    reset: mutation.reset,
  };
}
