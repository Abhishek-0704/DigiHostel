import { useQuery } from "@tanstack/react-query";
import {
  emergencyOperationsService,
  type EmergencyQueueParams,
} from "../../services/emergency/EmergencyService";
import { AppError, toAppError, safeMessageFor } from "../../lib/errors/errors";
import type { EmergencyList } from "@digihostel/api-client-react";

function mapEmergencyError(err: unknown): AppError {
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

export const EMERGENCY_QUEUE_QUERY_KEY = (params: EmergencyQueueParams) =>
  ["emergency-queue", params] as const;

export interface EmergencyQueueState {
  result: EmergencyList | null;
  isLoading: boolean;
  isFetching: boolean;
  error: AppError | null;
}

/**
 * Server-state layer for the Emergency Operations Center queue (Phase 4,
 * Prompt 10) — a thin `useQuery` wrapper, matching `useStudentSearch`'s
 * established convention exactly: server-side pagination/filtering/sorting,
 * never a client-side full-table fetch-then-filter.
 */
export function useEmergencyQueue(params: EmergencyQueueParams): EmergencyQueueState {
  const query = useQuery({
    queryKey: EMERGENCY_QUEUE_QUERY_KEY(params),
    queryFn: () => emergencyOperationsService.list(params),
    placeholderData: (previous) => previous,
  });

  return {
    result: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ? mapEmergencyError(query.error) : null,
  };
}

export { mapEmergencyError };
