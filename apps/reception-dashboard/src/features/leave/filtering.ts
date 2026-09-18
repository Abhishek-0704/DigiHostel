import { computeWaitingMinutes } from "./waitingTime";
import { isTerminalLeaveStatus } from "./types";
import type { LeaveQueueFilters, LeaveQueueItem, LeaveQueueSortOrder } from "./types";

/**
 * Pure filter/search/sort layer (Prompt 7A §15/§16/§17) — deliberately
 * framework-agnostic, mirroring `features/notifications/filtering.ts`'s
 * established shape exactly. Client-side, in-memory (§15's own explicit
 * escape valve: "determine whether the expected queue size makes
 * client-side filtering acceptable, document the tradeoff") — the backend
 * has no server-side search/filter/sort/pagination for this endpoint today
 * (`GET /leave-requests/queue` returns the caller's full authorized queue in
 * one response), and a single hostel's operationally-open leave request
 * count is expected to stay small (tens, not thousands) in the deployments
 * this dashboard targets. If real queue volume ever demonstrates otherwise,
 * this is the boundary a future server-side implementation would replace —
 * callers of `applyLeaveQueueView` would not need to change.
 */
export function matchesStatusFilters(item: LeaveQueueItem, filters: LeaveQueueFilters): boolean {
  if (filters.unresolvedOnly && isTerminalLeaveStatus(item.status)) return false;
  if (filters.statuses.length > 0 && !filters.statuses.includes(item.status)) return false;
  return true;
}

/** Substring match over every field an operator would plausibly search by
 * (§15): student name, roll number, hostel name, room number, and the
 * leave request's own reason text. Never over internal ids. */
export function matchesLeaveSearch(item: LeaveQueueItem, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") return true;
  const haystack = [
    item.studentFullName,
    item.studentRollNumber,
    item.studentHostelName ?? "",
    item.studentRoomNumber ?? "",
    item.reason,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(trimmed);
}

/** Deterministic ordering (§17): every order still applies id as a stable
 * secondary tie-breaker, so a realtime refetch never reshuffles rows whose
 * primary sort key is equal (matches
 * `features/notifications/notificationMerge.ts`'s established convention). */
export function sortLeaveQueue(
  items: readonly LeaveQueueItem[],
  order: LeaveQueueSortOrder,
  now: Date,
): LeaveQueueItem[] {
  const copy = [...items];
  switch (order) {
    case "oldest":
      return copy.sort(
        (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      );
    case "waiting_time":
      return copy.sort((a, b) => {
        const byWaiting =
          computeWaitingMinutes(b.createdAt, now) - computeWaitingMinutes(a.createdAt, now);
        return byWaiting !== 0 ? byWaiting : a.id.localeCompare(b.id);
      });
    case "student_name":
      return copy.sort((a, b) => {
        const byName = a.studentFullName.localeCompare(b.studentFullName);
        return byName !== 0 ? byName : a.id.localeCompare(b.id);
      });
    case "newest":
    default:
      return copy.sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
      );
  }
}

export function applyLeaveQueueView(
  items: readonly LeaveQueueItem[],
  filters: LeaveQueueFilters,
  searchQuery: string,
  sortOrder: LeaveQueueSortOrder,
  now: Date,
): LeaveQueueItem[] {
  const filtered = items.filter(
    (item) => matchesStatusFilters(item, filters) && matchesLeaveSearch(item, searchQuery),
  );
  return sortLeaveQueue(filtered, sortOrder, now);
}
