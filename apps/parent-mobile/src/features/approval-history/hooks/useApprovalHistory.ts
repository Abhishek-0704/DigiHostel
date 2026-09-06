import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { approvalService } from "../../../services/approvals/approvals";
import { mapLeaveApprovalError, type LeaveApprovalPresentationStatus } from "../../leave-approval";
import { mapLeaveRequestToHistoryRecord } from "../historyPresentationMapper";
import { searchHistoryRecords } from "../historySearch";
import { filterHistoryRecords } from "../historyFilter";
import {
  sortHistoryRecords,
  type HistorySortDirection,
  type HistorySortField,
} from "../historySort";

export const APPROVAL_HISTORY_QUERY_KEY = ["parent-mobile", "approval-history", "list"] as const;

/** Rendered in batches rather than all at once — the backend has no
 * pagination on `GET /leave-requests` (confirmed absent from both the
 * OpenAPI spec and the route handler), so the full, already parent-scoped
 * dataset is fetched once; this only limits how much of it is rendered into
 * the FlatList at a time, via `loadMore()`. See this feature's own
 * documentation (`docs/approval-history.md`) for why server-side pagination
 * is a documented future extension, not implemented here. */
const PAGE_SIZE = 20;

/**
 * Approval History list state (Phase 4 Prompt 10). Reuses the exact same
 * underlying call `usePendingApprovals()` already makes
 * (`approvalService.listForCurrentParent()`, already parent-scoped
 * server-side, G-05) under a different query key/purpose — History shows
 * every status, not just pending ones. Search/filter/sort are applied
 * client-side over the fetched array (see `historySearch.ts`'s doc comment
 * for why); changing any of them resets the visible page, so results never
 * appear inconsistently paginated against a stale window.
 */
export function useApprovalHistory() {
  const query = useQuery({
    queryKey: APPROVAL_HISTORY_QUERY_KEY,
    queryFn: () => approvalService.listForCurrentParent(),
    retry: false,
  });

  const [searchQuery, setSearchQueryState] = useState("");
  const [statusFilters, setStatusFiltersState] = useState<LeaveApprovalPresentationStatus[]>([]);
  const [sortField, setSortFieldState] = useState<HistorySortField>("requestedAt");
  const [sortDirection, setSortDirectionState] = useState<HistorySortDirection>("desc");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const allRecords = useMemo(
    () => (query.data ?? []).map(mapLeaveRequestToHistoryRecord),
    [query.data],
  );

  const matchingRecords = useMemo(() => {
    const searched = searchHistoryRecords(allRecords, searchQuery);
    const filtered = filterHistoryRecords(searched, { statuses: statusFilters });
    return sortHistoryRecords(filtered, sortField, sortDirection);
  }, [allRecords, searchQuery, statusFilters, sortField, sortDirection]);

  function resetPaging() {
    setVisibleCount(PAGE_SIZE);
  }

  return {
    records: matchingRecords.slice(0, visibleCount),
    totalCount: allRecords.length,
    matchingCount: matchingRecords.length,
    hasMore: visibleCount < matchingRecords.length,
    loadMore: () => setVisibleCount((count) => count + PAGE_SIZE),
    isLoading: query.isLoading,
    isRefreshing: query.isFetching && !query.isLoading,
    error: query.error ? mapLeaveApprovalError(query.error) : null,
    refresh: async () => {
      await query.refetch();
    },
    searchQuery,
    setSearchQuery: (value: string) => {
      setSearchQueryState(value);
      resetPaging();
    },
    statusFilters,
    setStatusFilters: (value: LeaveApprovalPresentationStatus[]) => {
      setStatusFiltersState(value);
      resetPaging();
    },
    sortField,
    sortDirection,
    setSort: (field: HistorySortField, direction: HistorySortDirection) => {
      setSortFieldState(field);
      setSortDirectionState(direction);
      resetPaging();
    },
  };
}
