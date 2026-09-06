import { leaveStatusLabel } from "../leave-approval";
import type { HistoryRecordPresentation } from "./historyPresentationMapper";

export type HistorySortField = "requestedAt" | "decidedAt" | "status";
export type HistorySortDirection = "asc" | "desc";

/**
 * Approval History sorting (Phase 4 Prompt 10) — no React/RN import.
 * Sorts on raw ISO-8601 timestamps (`requestedAt`/`decidedAt`), never on a
 * formatted display string — an unformatted string compares incorrectly
 * across, e.g., month boundaries or 12-hour time. `status` sorts on its
 * display label, since the presentation status has no other natural order.
 * A `null` timestamp (no decision yet, for `decidedAt`) is treated as the
 * smallest possible value, so it sorts first in ascending order and last in
 * descending order, exactly like every other value under the chosen
 * direction — no special-cased exemption from `direction`.
 */
function compareNullableIso(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a.localeCompare(b);
}

export function sortHistoryRecords(
  records: HistoryRecordPresentation[],
  field: HistorySortField,
  direction: HistorySortDirection,
): HistoryRecordPresentation[] {
  const sorted = [...records].sort((a, b) => {
    let comparison: number;
    if (field === "requestedAt") {
      comparison = compareNullableIso(a.requestedAt, b.requestedAt);
    } else if (field === "decidedAt") {
      comparison = compareNullableIso(a.decidedAt, b.decidedAt);
    } else {
      comparison = leaveStatusLabel(a.status).localeCompare(leaveStatusLabel(b.status));
    }
    return direction === "asc" ? comparison : -comparison;
  });
  return sorted;
}
