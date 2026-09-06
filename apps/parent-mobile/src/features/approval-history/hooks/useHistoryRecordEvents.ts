import { useQuery } from "@tanstack/react-query";
import { approvalService } from "../../../services/approvals/approvals";
import { mapLeaveApprovalError } from "../../leave-approval";

export const HISTORY_RECORD_EVENTS_QUERY_KEY = (leaveRequestId: string) =>
  ["parent-mobile", "approval-history", "events", leaveRequestId] as const;

/**
 * Approval History timeline data (Phase 4 Prompt 10) — wraps the new
 * `approvalService.getEvents()` (backed by the new, narrow
 * `GET /leave-requests/{id}/events` route) in TanStack Query, mirroring
 * `useLeaveApprovalDetails`'s established pattern exactly.
 */
export function useHistoryRecordEvents(leaveRequestId: string | undefined) {
  const query = useQuery({
    queryKey: HISTORY_RECORD_EVENTS_QUERY_KEY(leaveRequestId ?? ""),
    queryFn: () => approvalService.getEvents(leaveRequestId!),
    enabled: Boolean(leaveRequestId),
    retry: false,
  });

  return {
    events: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ? mapLeaveApprovalError(query.error) : null,
    refresh: async () => {
      await query.refetch();
    },
  };
}
