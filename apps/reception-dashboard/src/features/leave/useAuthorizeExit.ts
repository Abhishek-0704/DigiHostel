import { useMutation, useQueryClient } from "@tanstack/react-query";
import { leaveQueueService } from "../../services/leave/LeaveService";
import type { ExitAuthorization } from "../../services/leave/LeaveService";
import { AppError, safeMessageFor, toAppError } from "../../lib/errors/errors";
import { LEAVE_QUEUE_QUERY_KEY } from "./useLeaveQueue";
import { leaveApprovalEventsQueryKey } from "./useLeaveApprovalEvents";

function mapAuthorizeExitError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status: unknown }).status;
    if (status === 401)
      return new AppError("unauthenticated", safeMessageFor("unauthenticated"), err);
    if (status === 403) return new AppError("forbidden", safeMessageFor("forbidden"), err);
    if (status === 404) return new AppError("not_found", safeMessageFor("not_found"), err);
    if (status === 400) return new AppError("validation", safeMessageFor("validation"), err);
    // 409: the leave request isn't `approved` yet, or an exit authorization
    // already exists for it (a losing concurrent call, a stale tab, or an
    // honest double-click) — never presented as a hard failure the caller
    // must silently retry blindly; the query invalidation below still runs
    // so the workspace reflects real server state immediately.
    if (status === 409) return new AppError("conflict", safeMessageFor("conflict"), err);
  }
  return toAppError(err);
}

export interface AuthorizeExitState {
  authorize: (leaveRequestId: string) => void;
  isPending: boolean;
  error: AppError | null;
  data: ExitAuthorization | null;
  reset: () => void;
}

/**
 * Phase 3, Prompt 7C — Student Verification & Exit Authorization. The
 * mutation behind the Exit Authorization workspace's final "Confirm
 * Authorization" action. Thin `useMutation` wrapper, matching
 * `useStartParentApproval`'s established shape exactly (an `AppError`-mapped
 * state object, not the raw TanStack `UseMutationResult`; `identityConfirmed`
 * is always `true` here — the UI never calls this until the identity
 * confirmation step has been explicitly completed, matching
 * `AuthorizeExitInput`'s own backend-enforced requirement).
 *
 * Query invalidation runs in `onSettled` (not just `onSuccess`), same
 * reasoning as `useStartParentApproval`: both a genuine success and a 409
 * conflict mean the server-authoritative state may have changed since this
 * page last read it (someone else may have just authorized the same exit),
 * so the queue and this leave request's own approval-event timeline are
 * both refreshed either way. Never an optimistic local write — whether the
 * exit was actually recorded is entirely server-decided.
 */
export function useAuthorizeExit(): AuthorizeExitState {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (leaveRequestId: string) => leaveQueueService.authorizeExit(leaveRequestId, true),
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
    authorize: (leaveRequestId: string) => mutation.mutate(leaveRequestId),
    isPending: mutation.isPending,
    error: mutation.error ? mapAuthorizeExitError(mutation.error) : null,
    data: mutation.data ?? null,
    reset: mutation.reset,
  };
}
