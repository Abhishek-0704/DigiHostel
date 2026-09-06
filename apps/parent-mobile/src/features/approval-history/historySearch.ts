import { leaveStatusLabel } from "../leave-approval";
import type { HistoryRecordPresentation } from "./historyPresentationMapper";

/**
 * Approval History search (Phase 4 Prompt 10) — no React/RN import.
 * Case-insensitive substring match against `reason` and the status label
 * only. Student name/roll number/leave type/destination are NOT searchable
 * today because they are not authoritatively available at all (always
 * `null` — see `leavePresentationMapper.ts`'s doc comment); this is a
 * documented limitation, not a silently-narrower search than intended.
 *
 * Operates on an already-fetched, already parent-scoped in-memory array
 * (see `useApprovalHistory`'s own doc comment on why: the backend has no
 * server-side search endpoint, and a parent's own linked-students' leave
 * history is a small, naturally bounded dataset, not an unbounded one).
 */
export function searchHistoryRecords(
  records: HistoryRecordPresentation[],
  query: string,
): HistoryRecordPresentation[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return records;

  return records.filter((record) => {
    const haystacks = [record.reason ?? "", leaveStatusLabel(record.status)];
    return haystacks.some((haystack) => haystack.toLowerCase().includes(trimmed));
  });
}
