import { useMutation, useQueryClient } from "@tanstack/react-query";
import { approvalService } from "../../../services/approvals/approvals";
import type { BiometricAssertion } from "../../../services/biometric/biometric";
import { mapLeaveApprovalError } from "../leaveErrors";
import { mapLeaveRequestToPresentation } from "../leavePresentationMapper";
import {
  reconcileAfterDecisionFailure,
  type DecisionReconciliation,
} from "../leaveDecisionReconciliation";
import { LEAVE_APPROVAL_DETAILS_QUERY_KEY } from "./useLeaveApprovalDetails";
import { PENDING_APPROVALS_QUERY_KEY } from "./usePendingApprovals";
import { APPROVAL_HISTORY_QUERY_KEY } from "../../approval-history/hooks/useApprovalHistory";

export type LeaveDecision = "approved" | "rejected";

/**
 * Submits an approve/reject decision (Prompt 9B) — wraps `approvalService`
 * in a `useMutation` (no auto-retry, matching this app's global
 * `mutations: { retry: false }` default, `lib/queryClient.ts` — a
 * destructive mutation must never be blindly re-submitted after an
 * uncertain failure).
 *
 * On success: invalidates the pending-list, this request's own detail
 * query, and the Approval History list query, so every screen reading any
 * of them (leave/index.tsx, leave/[id].tsx, the dashboard's
 * PendingActionsCard, the History tab) picks up the real new state on next
 * read — never an optimistic local update.
 *
 * On failure: maps the error (`mapLeaveApprovalError`), then — for the
 * kinds where the mutation's actual effect is uncertain ("network",
 * "conflict") — re-reads the request directly via `approvalService.getById`
 * (bypassing the query cache; this is specifically for reconciliation, not
 * display) and hands both to the pure `reconcileAfterDecisionFailure`,
 * which is what actually decides the next UI state. This is the
 * implementation of this task's explicit "do not immediately resubmit;
 * fetch authoritative state and determine what happened" requirement.
 */
export function useDecideLeaveRequest(leaveRequestId: string) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({
      decision,
      assertion,
    }: {
      decision: LeaveDecision;
      assertion: BiometricAssertion;
    }) =>
      decision === "approved"
        ? approvalService.approve(leaveRequestId, assertion)
        : approvalService.reject(leaveRequestId, assertion),
  });

  async function decide(
    decision: LeaveDecision,
    assertion: BiometricAssertion,
  ): Promise<DecisionReconciliation> {
    try {
      await mutation.mutateAsync({ decision, assertion });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: PENDING_APPROVALS_QUERY_KEY }),
        queryClient.invalidateQueries({
          queryKey: LEAVE_APPROVAL_DETAILS_QUERY_KEY(leaveRequestId),
        }),
        // Approval History (`useApprovalHistory`) reads the same underlying
        // `listForCurrentParent()` call under its own query key — without
        // this, a decision made from this screen would leave History's
        // cache showing the pre-decision status until it happened to go
        // stale on its own.
        queryClient.invalidateQueries({ queryKey: APPROVAL_HISTORY_QUERY_KEY }),
      ]);
      return {
        uiState: decision === "approved" ? "approval_success" : "rejection_success",
        error: null,
      };
    } catch (err) {
      const appError = mapLeaveApprovalError(err);

      let refetchedPresentation = null;
      try {
        const fresh = await approvalService.getById(leaveRequestId);
        refetchedPresentation = mapLeaveRequestToPresentation(fresh);
      } catch {
        // Reconciling read also failed (e.g. still offline) — reconcile()
        // handles a null presentation by surfacing the original error
        // rather than guessing.
      }

      // Keep the cache consistent with whatever this reconciliation pass
      // just learned (or force a fresh pull on next read if it learned
      // nothing).
      await queryClient.invalidateQueries({
        queryKey: LEAVE_APPROVAL_DETAILS_QUERY_KEY(leaveRequestId),
      });

      return reconcileAfterDecisionFailure(appError, refetchedPresentation);
    }
  }

  return {
    decide,
    isProcessing: mutation.isPending,
  };
}
