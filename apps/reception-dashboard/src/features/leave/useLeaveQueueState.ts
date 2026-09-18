import { useMemo, useState } from "react";
import { applyLeaveQueueView } from "./filtering";
import { emptyLeaveQueueFilters } from "./types";
import type { LeaveQueueFilters, LeaveQueueItem, LeaveQueueSortOrder } from "./types";

export interface LeaveQueueUiState {
  filters: LeaveQueueFilters;
  setFilters: (filters: LeaveQueueFilters) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  sortOrder: LeaveQueueSortOrder;
  setSortOrder: (order: LeaveQueueSortOrder) => void;
  visibleItems: LeaveQueueItem[];
  selectedIds: ReadonlySet<string>;
  toggleSelect: (id: string, checked: boolean) => void;
  toggleSelectAllVisible: (checked: boolean) => void;
  clearSelection: () => void;
  activeId: string | null;
  setActiveId: (id: string | null) => void;
}

/**
 * Page-local UI state for the Reception Leave Request Queue (Prompt 7A §26
 * — "page/UI state: selected request, filters, search, sort, pagination,
 * panel open/closed, selection"). Mirrors
 * `features/notifications/useNotificationCenterState.ts`'s established
 * shape exactly — kept local to the queue page, never folded into a global
 * store (§26 — "do not introduce a new global state library").
 *
 * Selection here is intentionally read-only bookkeeping (§21 — safe bulk
 * capabilities are limited to "select multiple / inspect selection count /
 * clear selection"); no bulk state-changing action is wired to it, since no
 * existing backend contract authorizes bulk approval/rejection/expiry (§21's
 * explicit prohibition).
 */
export function useLeaveQueueState(items: LeaveQueueItem[]): LeaveQueueUiState {
  const [filters, setFilters] = useState<LeaveQueueFilters>(emptyLeaveQueueFilters());
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<LeaveQueueSortOrder>("newest");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);

  const visibleItems = useMemo(
    () => applyLeaveQueueView(items, filters, searchQuery, sortOrder, new Date()),
    [items, filters, searchQuery, sortOrder],
  );

  function toggleSelect(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleSelectAllVisible(checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const item of visibleItems) {
        if (checked) next.add(item.id);
        else next.delete(item.id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  return {
    filters,
    setFilters,
    searchQuery,
    setSearchQuery,
    sortOrder,
    setSortOrder,
    visibleItems,
    selectedIds,
    toggleSelect,
    toggleSelectAllVisible,
    clearSelection,
    activeId,
    setActiveId,
  };
}
