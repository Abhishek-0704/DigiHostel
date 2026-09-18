import { useMutation, useQueryClient } from "@tanstack/react-query";
import { leaveQueueService } from "../../services/leave/LeaveService";
import { AppError, safeMessageFor, toAppError } from "../../lib/errors/errors";
import { LEAVE_QUEUE_QUERY_KEY } from "./useLeaveQueue";
import { leaveApprovalEventsQueryKey } from "./useLeaveApprovalEvents";

function mapStartParentApprovalError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status: unknown }).status;
    if (status === 401)
      return new AppError("unauthenticated", safeMessageFor("unauthenticated"), err);
    if (status === 403) return new AppError("forbidden", safeMessageFor("forbidden"), err);
    if (status === 404) return new AppError("not_found", safeMessageFor("not_found"), err);
    // 409: not currently pending — either a losing concurrent click, or the
    // request was already sent for parent approval by someone else. Either
    // way the request IS now in the parent-approval lifecycle; the query
    // invalidation below still runs (onSettled, not onSuccess) so the UI
    // reflects that real state immediately rather than staying stale.
    if (status === 409) return new AppError("conflict", safeMessageFor("conflict"), err);
  }
  return toAppError(err);
}

export interface StartParentApprovalState {
  start: (leaveRequestId: string) => void;
  isPending: boolean;
  error: AppError | null;
  reset: () => void;
}

/**
 * Reception-Initiated Parent Approval correction — the mutation behind the
 * Parent Approval Session Workspace's "Send for Parent Approval" action
 * (`LeaveDetailPage`). Thin `useMutation` wrapper, matching this feature's
 * existing `useLeaveQueue`/`useLeaveApprovalEvents` shape (an `AppError`-
 * mapped state object, not the raw TanStack `UseMutationResult`).
 *
 * Query invalidation runs in `onSettled` (not just `onSuccess`) so both a
 * genuine success and a 409 conflict (see `mapStartParentApprovalError`)
 * refresh the queue and this request's own approval-event timeline — either
 * way the server-authoritative state may have changed since this page last
 * read it, and the UI should reflect that immediately rather than waiting
 * for the next realtime tick or manual refresh. Never an optimistic local
 * write: the actual next stage is entirely server-decided.
 */
export function useStartParentApproval(): StartParentApprovalState {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (leaveRequestId: string) => leaveQueueService.startParentApproval(leaveRequestId),
    onSettled: (_data, _error, leaveRequestId) => {
      void queryClient.invalidateQueries({ queryKey: LEAVE_QUEUE_QUERY_KEY });
      if (leaveRequestId) {
        void queryClient.invalidateQueries({
          queryKey: leaveApprovalEventsQueryKey(leaveRequestId),
        });
      }
    },
  });

  return {
    start: (leaveRequestId: string) => mutation.mutate(leaveRequestId),
    isPending: mutation.isPending,
    error: mutation.error ? mapStartParentApprovalError(mutation.error) : null,
    reset: mutation.reset,
  };
}
