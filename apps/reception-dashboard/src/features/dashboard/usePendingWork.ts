import type { FuturePanelState, TaskItemData } from "./types";

/**
 * Pending Work data source (Prompt 5 §10). `LeaveService`/`StudentService`
 * remain interface-only (see `operationalSummary.ts`'s doc comment for the
 * full evidence trail on why leave/verification data is not readable by a
 * reception staff session today) — there is genuinely nothing to list yet.
 *
 * A real hook, not an inline empty state, so a future prompt that wires
 * real pending-work data (leave requests needing manual verification,
 * failed approval attempts, students waiting at reception) only has to
 * change this function's implementation — `PendingWorkPanel` already
 * renders whatever `items` it receives, in priority order.
 */
export function usePendingWork(): FuturePanelState<TaskItemData> {
  return { availability: "placeholder", items: [] };
}
