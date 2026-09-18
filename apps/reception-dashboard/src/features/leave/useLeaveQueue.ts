import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { leaveQueueService } from "../../services/leave/LeaveService";
import { AppError, safeMessageFor, toAppError } from "../../lib/errors/errors";
import type { LeaveQueueItem } from "./types";

/** Maps the generated client's thrown `{status, message}` shape
 * (`packages/api-client-react/src/custom-fetch.ts`) to this app's own
 * AppError taxonomy — never surfaces the raw response body (which may
 * contain a backend error `code` string, not something a staff operator
 * needs to see verbatim) to the UI. Unrecognized shapes fall back to
 * `toAppError`'s generic "unknown" mapping. */
function mapLeaveQueueError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status: unknown }).status;
    if (status === 401)
      return new AppError("unauthenticated", safeMessageFor("unauthenticated"), err);
    if (status === 403) return new AppError("forbidden", safeMessageFor("forbidden"), err);
  }
  return toAppError(err);
}

/** Canonical query key namespace for the Reception Leave Request Queue —
 * mirrors `DASHBOARD_QUERY_KEY_NAMESPACE`/`NOTIFICATION_QUERY_KEY`'s
 * existing per-feature-namespace convention. Both the page's manual refresh
 * button and `useLeaveQueueRealtime`'s invalidate-on-change handler target
 * this exact key, so there is never a second, competing cache entry for the
 * same data. */
export const LEAVE_QUEUE_QUERY_KEY = ["leave-queue"] as const;

export interface LeaveQueueState {
  items: LeaveQueueItem[];
  isLoading: boolean;
  isFetching: boolean;
  error: AppError | null;
  refresh: () => Promise<void>;
}

/**
 * Server-state layer for the Reception Leave Request Queue (Prompt 7A §26 —
 * "server state: queue requests"). A thin `useQuery` wrapper, matching this
 * app's existing TanStack Query convention (`useOperationalSummary`,
 * `NotificationContext`) rather than a bespoke fetch/state pattern.
 */
export function useLeaveQueue(): LeaveQueueState {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: LEAVE_QUEUE_QUERY_KEY,
    queryFn: () => leaveQueueService.listQueue(),
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: LEAVE_QUEUE_QUERY_KEY });
  }, [queryClient]);

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ? mapLeaveQueueError(query.error) : null,
    refresh,
  };
}
