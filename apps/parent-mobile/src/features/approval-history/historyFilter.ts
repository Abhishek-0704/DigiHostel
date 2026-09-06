import type { LeaveApprovalPresentationStatus } from "../leave-approval";
import type { HistoryRecordPresentation } from "./historyPresentationMapper";

/**
 * Approval History filtering (Phase 4 Prompt 10) — no React/RN import.
 * Status values are limited to the real, existing presentation vocabulary
 * (`awaiting_response | approved | rejected | expired | unknown` —
 * `leave-approval/types.ts`). No `cancelled` filter option exists: the
 * backend's `leave_request_status` enum has no such value
 * (`packages/db/src/schema/enums.ts`), and this app never invents one.
 */
export interface HistoryFilters {
  /** Empty array means "no status filter applied" — never treated as
   * "match nothing." */
  statuses: LeaveApprovalPresentationStatus[];
}

export function filterHistoryRecords(
  records: HistoryRecordPresentation[],
  filters: HistoryFilters,
): HistoryRecordPresentation[] {
  if (filters.statuses.length === 0) return records;
  const allowed = new Set(filters.statuses);
  return records.filter((record) => allowed.has(record.status));
}
