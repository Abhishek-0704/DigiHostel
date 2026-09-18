import { useMemo, useState } from "react";
import { applyNotificationView } from "./filtering";
import { emptyFilters } from "./types";
import type { Notification, NotificationFilters, NotificationSortOrder } from "./types";

export interface NotificationCenterState {
  filters: NotificationFilters;
  setFilters: (filters: NotificationFilters) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  sortOrder: NotificationSortOrder;
  setSortOrder: (order: NotificationSortOrder) => void;
  visibleNotifications: Notification[];
  selectedIds: ReadonlySet<string>;
  toggleSelect: (id: string, checked: boolean) => void;
  toggleSelectAllVisible: (checked: boolean) => void;
  clearSelection: () => void;
  activeId: string | null;
  setActiveId: (id: string | null) => void;
}

/**
 * Page-local UI state for the Notification Center (Prompt 6 §28). Kept
 * entirely local to whichever component calls this hook (the Notification
 * Center page) rather than folded into the global `NotificationContext` —
 * filters/search/sort/selection/the currently-open detail are UI concerns
 * specific to one page, not canonical notification state every consumer
 * needs (§28's explicit "do not automatically place all of this into a
 * global store"). Only `notifications`/`unreadCount` are global
 * (`NotificationContext`).
 */
export function useNotificationCenterState(notifications: Notification[]): NotificationCenterState {
  const [filters, setFilters] = useState<NotificationFilters>(emptyFilters());
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<NotificationSortOrder>("newest");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);

  const visibleNotifications = useMemo(
    () => applyNotificationView(notifications, filters, searchQuery, sortOrder),
    [notifications, filters, searchQuery, sortOrder],
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
      for (const n of visibleNotifications) {
        if (checked) next.add(n.id);
        else next.delete(n.id);
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
    visibleNotifications,
    selectedIds,
    toggleSelect,
    toggleSelectAllVisible,
    clearSelection,
    activeId,
    setActiveId,
  };
}
