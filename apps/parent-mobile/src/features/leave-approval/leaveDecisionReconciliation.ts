import type { AppError } from "../../types/errors";
import type { LeaveApprovalUiState, LeaveRequestPresentation } from "./types";
import { deriveUiStateFromPresentation } from "./leavePresentationMapper";

/**
 * Pure reconciliation logic for a failed approve/reject submission (Prompt
 * 9B) — no React import, unit-tested directly with Vitest, matching this
 * feature's existing discipline (`leavePresentationMapper.ts`,
 * `leaveTimeline.ts`, etc.).
 *
 * This app's mutations never auto-retry (`lib/queryClient.ts`'s global
 * `mutations: { retry: false }`), and this prompt's own instructions
 * explicitly forbid blindly re-submitting a destructive mutation after an
 * uncertain failure. Instead: a `"network"` or `"conflict"` outcome means
 * the mutation's actual effect is genuinely uncertain (the request may have
 * been recorded server-side before the response was lost, or a concurrent
 * decision may have already won — ADR-017 §4's race-resolution invariant),
 * so the caller must have already refetched the leave request's
 * authoritative state and hand it here — this function trusts that fresh
 * state completely, never the failed mutation's own optimistic assumption.
 * Every other error kind (`forbidden`, `device_revoked`,
 * `biometric_verification_failed`, `validation`, `not_found`, `unknown`)
 * means the mutation definitely did not apply — no refetch is needed to
 * know that.
 */
export interface DecisionReconciliation {
  uiState: LeaveApprovalUiState;
  /** Non-null when there is something the user should still be told about
   * (every case except a successfully-resolved uncertain outcome). */
  error: AppError | null;
}

const UNCERTAIN_KINDS = new Set<AppError["kind"]>(["network", "conflict"]);

export function reconcileAfterDecisionFailure(
  error: AppError,
  refetchedPresentation: LeaveRequestPresentation | null,
): DecisionReconciliation {
  if (UNCERTAIN_KINDS.has(error.kind) && refetchedPresentation) {
    // Authoritative state is available — defer to it entirely. If the
    // decision actually went through (possibly via a differently-worded
    // race, e.g. a concurrent decision from the other parent), this
    // correctly reflects "already_processed"/"expired" rather than
    // insisting the submission failed; if it genuinely didn't apply, this
    // correctly returns "loaded" so the user can retry.
    return { uiState: deriveUiStateFromPresentation(refetchedPresentation), error: null };
  }

  // Either a definite failure (mutation certainly did not apply), or an
  // uncertain one where even the reconciling refetch couldn't complete
  // (e.g. still offline) — surface the error and let the user retry
  // explicitly (Confirm again, or pull-to-refresh) rather than guessing.
  return { uiState: "loaded", error };
}
