import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  healthOperationsService,
  type ReportHealthCaseParams,
} from "../../services/health/HealthService";
import { mapHealthError } from "./useHealthCaseQueue";
import { HEALTH_CASE_STATISTICS_QUERY_KEY } from "./useHealthCaseStatistics";
import { AppError, safeMessageFor, toAppError } from "../../lib/errors/errors";
import type { HealthCaseDetail } from "@digihostel/api-client-react";

function mapReportHealthCaseError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status: unknown }).status;
    if (status === 404) return new AppError("not_found", safeMessageFor("not_found"), err);
  }
  return mapHealthError(err) ?? toAppError(err);
}

export interface ReportHealthCaseState {
  report: (params: ReportHealthCaseParams) => void;
  isPending: boolean;
  error: AppError | null;
  data: HealthCaseDetail | null;
  reset: () => void;
}

/**
 * The mutation behind the Report Health Case form (Student Profile's real
 * "Report Health Case" quick action — Phase 4, Prompt 11). One atomic
 * server command; invalidates the queue + statistics so the Health
 * Operations Center reflects the new case immediately, even without waiting
 * for the realtime subscription.
 */
export function useReportHealthCase(): ReportHealthCaseState {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (params: ReportHealthCaseParams) => healthOperationsService.report(params),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["health-case-queue"] });
      void queryClient.invalidateQueries({ queryKey: HEALTH_CASE_STATISTICS_QUERY_KEY });
    },
  });

  return {
    report: (params) => mutation.mutate(params),
    isPending: mutation.isPending,
    error: mutation.error ? mapReportHealthCaseError(mutation.error) : null,
    data: mutation.data ?? null,
    reset: mutation.reset,
  };
}
