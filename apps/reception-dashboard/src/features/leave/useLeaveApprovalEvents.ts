import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listLeaveRequestEvents, type LeaveApprovalEvent } from "@digihostel/api-client-react";
import { AppError, safeMessageFor, toAppError } from "../../lib/errors/errors";

/** Canonical query key namespace for one leave request's approval-event
 * timeline — parameterized by id, matching `LEAVE_QUEUE_QUERY_KEY`'s own
 * per-feature-namespace convention. */
export function leaveApprovalEventsQueryKey(leaveRequestId: string) {
  return ["leave-approval-events", leaveRequestId] as const;
}

function mapEventsError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status: unknown }).status;
    if (status === 401)
      return new AppError("unauthenticated", safeMessageFor("unauthenticated"), err);
    if (status === 403) return new AppError("forbidden", safeMessageFor("forbidden"), err);
    if (status === 404) return new AppError("not_found", safeMessageFor("not_found"), err);
  }
  return toAppError(err);
}

export interface LeaveApprovalEventsState {
  events: LeaveApprovalEvent[];
  isLoading: boolean;
  error: AppError | null;
  refresh: () => Promise<void>;
}

/**
 * Server-state layer for the Parent Approval Session Workspace's timeline
 * (Phase 3, Prompt 7B). Thin `useQuery` wrapper over the now-staff-reachable
 * `GET /leave-requests/{id}/events` (extended for staff after the
 * `lae_select_staff` RLS remediation was independently verified — see
 * `docs/leave-queue.md` §13) — matches `useLeaveQueue`'s own established
 * shape exactly. `enabled: !!leaveRequestId` avoids firing with an empty id
 * during initial route param resolution.
 */
export function useLeaveApprovalEvents(
  leaveRequestId: string | undefined,
): LeaveApprovalEventsState {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: leaveApprovalEventsQueryKey(leaveRequestId ?? ""),
    queryFn: () => listLeaveRequestEvents(leaveRequestId as string),
    enabled: !!leaveRequestId,
  });

  const refresh = useCallback(async () => {
    if (!leaveRequestId) return;
    await queryClient.invalidateQueries({ queryKey: leaveApprovalEventsQueryKey(leaveRequestId) });
  }, [queryClient, leaveRequestId]);

  return {
    events: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ? mapEventsError(query.error) : null,
    refresh,
  };
}
