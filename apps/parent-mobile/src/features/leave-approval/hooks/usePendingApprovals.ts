import { useQuery } from "@tanstack/react-query";
import { approvalService } from "../../../services/approvals/approvals";
import { filterAwaitingResponse, mapLeaveRequestToPresentation } from "../leavePresentationMapper";
import { mapLeaveApprovalError } from "../leaveErrors";

export const PENDING_APPROVALS_QUERY_KEY = ["parent-mobile", "leave-approval", "pending"] as const;

/**
 * Pending Approval list data (Prompt 9A, backend-integrated in 9B). Wraps
 * `approvalService.listForCurrentParent()`, which — per its own contract and
 * `docs/api-contract.md` — returns EVERY leave request linked to this
 * parent's students, in every status, not only the decidable ones. This hook
 * exists specifically to narrow that feed to "awaiting your response" (every
 * status `leavePresentationMapper.mapBackendStatus` collapses to
 * `"awaiting_response"`), matching what every consumer of `leaveRequests`/
 * `pendingCount` (the Pending Approval list, the Dashboard's
 * `PendingActionsCard`) actually means by "pending" — mirroring the same
 * filter `useLinkedStudents.ts` already applies independently to the same
 * raw feed for its own per-student summary.
 */
export function usePendingApprovals() {
  const query = useQuery({
    queryKey: PENDING_APPROVALS_QUERY_KEY,
    queryFn: () => approvalService.listForCurrentParent(),
    retry: false,
  });

  const presentations = filterAwaitingResponse(
    (query.data ?? []).map(mapLeaveRequestToPresentation),
  );

  return {
    leaveRequests: presentations,
    pendingCount: presentations.length,
    isLoading: query.isLoading,
    isRefreshing: query.isFetching && !query.isLoading,
    error: query.error ? mapLeaveApprovalError(query.error) : null,
    refresh: async () => {
      await query.refetch();
    },
  };
}
