import { useQuery } from "@tanstack/react-query";
import { approvalService } from "../../../services/approvals/approvals";
import { mapLeaveApprovalError } from "../../leave-approval";
import { mapLeaveRequestToHistoryRecord } from "../historyPresentationMapper";

export const HISTORY_RECORD_DETAILS_QUERY_KEY = (leaveRequestId: string) =>
  ["parent-mobile", "approval-history", "details", leaveRequestId] as const;

/**
 * Approval History Detail record data (Phase 4 Prompt 10) — wraps the same
 * `approvalService.getById()` `useLeaveApprovalDetails` already uses, but
 * maps through `mapLeaveRequestToHistoryRecord` instead of
 * `mapLeaveRequestToPresentation` so this screen also gets `decidedAt`/
 * `requestedAt`. Kept as its own hook (own query key) rather than reusing
 * `useLeaveApprovalDetails` directly, since that hook's mapper discards the
 * raw `updatedAt` this feature needs — exactly the same
 * one-service/two-presentation-mappers split already established by
 * `usePendingApprovals`/`useLeaveApprovalDetails` themselves.
 */
export function useHistoryRecordDetails(leaveRequestId: string | undefined) {
  const query = useQuery({
    queryKey: HISTORY_RECORD_DETAILS_QUERY_KEY(leaveRequestId ?? ""),
    queryFn: () => approvalService.getById(leaveRequestId!),
    enabled: Boolean(leaveRequestId),
    retry: false,
  });

  return {
    record: query.data ? mapLeaveRequestToHistoryRecord(query.data) : null,
    isLoading: query.isLoading,
    error: query.error ? mapLeaveApprovalError(query.error) : null,
    refresh: async () => {
      await query.refetch();
    },
  };
}
