import { useQuery } from "@tanstack/react-query";
import { approvalService } from "../../../services/approvals/approvals";
import { mapLeaveRequestToPresentation } from "../leavePresentationMapper";
import { mapLeaveApprovalError } from "../leaveErrors";

export const LEAVE_APPROVAL_DETAILS_QUERY_KEY = (leaveRequestId: string) =>
  ["parent-mobile", "leave-approval", "details", leaveRequestId] as const;

/**
 * Leave Details data (Prompt 9A) — wraps the existing, real (if fail-closed)
 * `approvalService.getById()` in TanStack Query, mirroring `useDevice()`/
 * `useNotificationCenter()`'s established pattern. This is reading through
 * an ALREADY-EXISTING service boundary (Prompt 2), not new API integration
 * — `approvalService` always rejects with `ApprovalServiceNotImplementedError`
 * today, so this hook's real production behavior is `error` (mapped to the
 * honest `leave_approval_unavailable` kind), not new backend wiring. See
 * `docs/leave-approval.md` §1.
 */
export function useLeaveApprovalDetails(leaveRequestId: string | undefined) {
  const query = useQuery({
    queryKey: LEAVE_APPROVAL_DETAILS_QUERY_KEY(leaveRequestId ?? ""),
    queryFn: () => approvalService.getById(leaveRequestId!),
    enabled: Boolean(leaveRequestId),
    retry: false,
  });

  return {
    presentation: query.data ? mapLeaveRequestToPresentation(query.data) : null,
    isLoading: query.isLoading,
    error: query.error ? mapLeaveApprovalError(query.error) : null,
    refresh: async () => {
      await query.refetch();
    },
  };
}
