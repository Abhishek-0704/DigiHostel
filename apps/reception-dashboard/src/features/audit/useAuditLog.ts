import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { auditService, type AuditListParams } from "../../services/audit/AuditService";
import { AppError, toAppError, safeMessageFor } from "../../lib/errors/errors";
import type { AuditList } from "@digihostel/api-client-react";

function mapAuditError(err: unknown): AppError {
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

export const AUDIT_LOG_QUERY_KEY = (params: AuditListParams) => ["audit-log", params] as const;

export interface AuditLogState {
  result: AuditList | null;
  isLoading: boolean;
  isFetching: boolean;
  error: AppError | null;
  refresh: () => Promise<void>;
}

/**
 * Server-state layer for the Enterprise Audit Center (Phase 5, Prompt 12) —
 * a thin `useQuery` wrapper, matching `useHealthCaseQueue`'s established
 * convention exactly: server-side pagination/filtering/sorting, never a
 * client-side full-table fetch-then-filter.
 */
export function useAuditLog(params: AuditListParams): AuditLogState {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: AUDIT_LOG_QUERY_KEY(params),
    queryFn: () => auditService.list(params),
    placeholderData: (previous) => previous,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["audit-log"] });
  }, [queryClient]);

  return {
    result: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ? mapAuditError(query.error) : null,
    refresh,
  };
}

export { mapAuditError };
