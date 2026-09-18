import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  configurationService,
  type ConfigurationListParams,
} from "../../services/configuration/ConfigurationService";
import { AppError, toAppError, safeMessageFor } from "../../lib/errors/errors";
import type { ConfigurationList } from "@digihostel/api-client-react";

export function mapConfigurationError(err: unknown): AppError {
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

export const CONFIGURATION_LIST_QUERY_KEY = (params: ConfigurationListParams) =>
  ["configuration-list", params] as const;

export interface ConfigurationListState {
  result: ConfigurationList | null;
  isLoading: boolean;
  isFetching: boolean;
  error: AppError | null;
  refresh: () => Promise<void>;
}

/**
 * Server-state layer for the Enterprise Configuration Center (Phase 5,
 * Prompt 14) — a thin `useQuery` wrapper, matching `useStaffDirectory`'s/
 * `useAuditLog`'s established convention exactly: server-side pagination/
 * filtering/sorting.
 */
export function useConfigurationList(params: ConfigurationListParams): ConfigurationListState {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: CONFIGURATION_LIST_QUERY_KEY(params),
    queryFn: () => configurationService.list(params),
    placeholderData: (previous) => previous,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["configuration-list"] });
  }, [queryClient]);

  return {
    result: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ? mapConfigurationError(query.error) : null,
    refresh,
  };
}
