import { useMutation, useQueryClient } from "@tanstack/react-query";
import { movementService, type HostelReturn } from "../../services/movement/MovementService";
import { AppError, safeMessageFor, toAppError } from "../../lib/errors/errors";
import { studentProfileQueryKey } from "../students";
import { leaveApprovalEventsQueryKey } from "../leave";

function mapRecordHostelReturnError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status: unknown }).status;
    if (status === 401)
      return new AppError("unauthenticated", safeMessageFor("unauthenticated"), err);
    if (status === 403) return new AppError("forbidden", safeMessageFor("forbidden"), err);
    if (status === 404) return new AppError("not_found", safeMessageFor("not_found"), err);
    if (status === 400) return new AppError("validation", safeMessageFor("validation"), err);
    // 409: the leave isn't approved/exit-authorized yet, or a return already
    // exists for it (a losing concurrent call, a stale tab, or an honest
    // double-click) — same non-fatal-conflict treatment
    // `useAuthorizeExit`/`useStartParentApproval` already established; the
    // query invalidation below still runs so the workspace reflects real
    // server state immediately either way.
    if (status === 409) return new AppError("conflict", safeMessageFor("conflict"), err);
  }
  return toAppError(err);
}

export interface RecordHostelReturnParams {
  leaveRequestId: string;
  /** Needed only to invalidate the right `GET /students/{rollNumber}`
   * cache entry afterward — never sent to the server (the mutation itself
   * only ever posts to `/leave-requests/{leaveRequestId}/return`). */
  rollNumber: string;
}

export interface RecordHostelReturnState {
  record: (params: RecordHostelReturnParams) => void;
  isPending: boolean;
  error: AppError | null;
  data: HostelReturn | null;
  reset: () => void;
}

/**
 * Phase 4, Prompt 9 — Hostel Return. The mutation behind the Return
 * Workspace's final "Confirm Register Return" action. Thin `useMutation`
 * wrapper, matching `useAuthorizeExit`'s established shape exactly — one
 * atomic server command, never an optimistic local write or multiple
 * independent client writes. Query invalidation runs in `onSettled` (not
 * just `onSuccess`), same reasoning as `useAuthorizeExit`: both a genuine
 * success and a 409 conflict mean server-authoritative state may have
 * changed since this page last read it, so the student's own profile
 * (`returnRecorded`) and its approval-event timeline are both refreshed
 * either way.
 */
export function useRecordHostelReturn(): RecordHostelReturnState {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (params: RecordHostelReturnParams) =>
      movementService.recordHostelReturn(params.leaveRequestId),
    onSettled: (_data, _error, params) => {
      void queryClient.invalidateQueries({ queryKey: studentProfileQueryKey(params.rollNumber) });
      void queryClient.invalidateQueries({
        queryKey: leaveApprovalEventsQueryKey(params.leaveRequestId),
      });
    },
  });

  return {
    record: (params: RecordHostelReturnParams) => mutation.mutate(params),
    isPending: mutation.isPending,
    error: mutation.error ? mapRecordHostelReturnError(mutation.error) : null,
    data: mutation.data ?? null,
    reset: mutation.reset,
  };
}
