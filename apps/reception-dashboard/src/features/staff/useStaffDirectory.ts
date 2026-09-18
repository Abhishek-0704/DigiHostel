import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { staffAdminService, type StaffListParams } from "../../services/staff/StaffService";
import { AppError, toAppError, safeMessageFor } from "../../lib/errors/errors";
import type { StaffList } from "@digihostel/api-client-react";

export function mapStaffError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status: unknown }).status;
    if (status === 401)
      return new AppError("unauthenticated", safeMessageFor("unauthenticated"), err);
    if (status === 403) return new AppError("forbidden", safeMessageFor("forbidden"), err);
    if (status === 404) return new AppError("not_found", safeMessageFor("not_found"), err);
    if (status === 409) return new AppError("conflict", safeMessageFor("conflict"), err);
    if (status === 400) return new AppError("validation", safeMessageFor("validation"), err);
  }
  return toAppError(err);
}

export const STAFF_DIRECTORY_QUERY_KEY = (params: StaffListParams) =>
  ["staff-directory", params] as const;

export interface StaffDirectoryState {
  result: StaffList | null;
  isLoading: boolean;
  isFetching: boolean;
  error: AppError | null;
  refresh: () => Promise<void>;
}

/**
 * Server-state layer for the Identity & Access Administration Center
 * (Phase 5, Prompt 13) — a thin `useQuery` wrapper, matching
 * `useAuditLog`'s/`useHealthCaseQueue`'s established convention exactly:
 * server-side pagination/filtering/sorting, never a client-side full-table
 * fetch-then-filter.
 */
export function useStaffDirectory(params: StaffListParams): StaffDirectoryState {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: STAFF_DIRECTORY_QUERY_KEY(params),
    queryFn: () => staffAdminService.list(params),
    placeholderData: (previous) => previous,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["staff-directory"] });
  }, [queryClient]);

  return {
    result: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ? mapStaffError(query.error) : null,
    refresh,
  };
}
