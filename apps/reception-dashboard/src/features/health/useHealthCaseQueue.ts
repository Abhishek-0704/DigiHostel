import { useQuery } from "@tanstack/react-query";
import {
  healthOperationsService,
  type HealthCaseQueueParams,
} from "../../services/health/HealthService";
import { AppError, toAppError, safeMessageFor } from "../../lib/errors/errors";
import type { HealthCaseList } from "@digihostel/api-client-react";

function mapHealthError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status: unknown }).status;
    if (status === 401)
      return new AppError("unauthenticated", safeMessageFor("unauthenticated"), err);
    if (status === 403) return new AppError("forbidden", safeMessageFor("forbidden"), err);
    if (status === 400) return new AppError("validation", safeMessageFor("validation"), err);
  }
  return toAppError(err);
}

export const HEALTH_CASE_QUEUE_QUERY_KEY = (params: HealthCaseQueueParams) =>
  ["health-case-queue", params] as const;

export interface HealthCaseQueueState {
  result: HealthCaseList | null;
  isLoading: boolean;
  isFetching: boolean;
  error: AppError | null;
}

/**
 * Server-state layer for the Health Operations Center queue (Phase 4,
 * Prompt 11) — a thin `useQuery` wrapper, matching `useEmergencyQueue`'s
 * established convention exactly: server-side pagination/filtering/sorting,
 * never a client-side full-table fetch-then-filter.
 */
export function useHealthCaseQueue(params: HealthCaseQueueParams): HealthCaseQueueState {
  const query = useQuery({
    queryKey: HEALTH_CASE_QUEUE_QUERY_KEY(params),
    queryFn: () => healthOperationsService.list(params),
    placeholderData: (previous) => previous,
  });

  return {
    result: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ? mapHealthError(query.error) : null,
  };
}

export { mapHealthError };
