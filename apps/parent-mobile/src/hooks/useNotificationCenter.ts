import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationService } from "../services/notifications/notifications";
import { notificationActionsService } from "../services/notifications/notificationActions";
import { mapNotificationError } from "../features/notifications/notificationErrors";
import { searchNotifications } from "../features/notifications/notificationSearch";
import {
  filterNotifications,
  type NotificationFilter,
} from "../features/notifications/notificationFilters";
import {
  sortNotifications,
  type NotificationSortOrder,
} from "../features/notifications/notificationSorting";
import { AppError, safeMessageFor } from "../types/errors";
import { useNotificationRealtime } from "./useNotificationRealtime";
import { useDebounce } from "./useDebounce";

export const NOTIFICATIONS_QUERY_KEY = ["parent-mobile", "notifications"] as const;

export type NotificationActionRequest =
  | { kind: "markAsRead"; notificationId: string }
  | { kind: "markAllAsRead" }
  | { kind: "delete"; notificationId: string }
  | { kind: "archive"; notificationId: string };

/**
 * Notification Center state (Prompt 8) — the single hook `notifications.tsx`
 * and `notifications/[id].tsx` read from.
 *
 * Server state (the list) is TanStack Query, exactly like `useDevice()`
 * (Prompt 6). Search/filter/sort are local, ephemeral UI state — derived
 * client-side via the pure functions in `src/features/notifications/`, never
 * a second server round-trip (no server-side search/filter endpoint exists —
 * see `notificationSearch.ts`'s doc comment). Realtime invalidates this same
 * query on any change rather than maintaining a separate live list.
 */
export function useNotificationCenter() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [sortOrder, setSortOrder] = useState<NotificationSortOrder>("newest");
  const debouncedSearch = useDebounce(searchQuery, 250);

  const listQuery = useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: () => notificationService.listNotifications(),
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
  }, [queryClient]);

  const realtimeStatus = useNotificationRealtime(invalidate);

  const notifications = listQuery.data ?? [];

  const visibleNotifications = useMemo(() => {
    const searched = searchNotifications(notifications, debouncedSearch);
    const filtered = filterNotifications(searched, filter);
    return sortNotifications(filtered, sortOrder);
  }, [notifications, debouncedSearch, filter, sortOrder]);

  const actionMutation = useMutation({
    mutationFn: (request: NotificationActionRequest) => {
      switch (request.kind) {
        case "markAsRead":
          return notificationActionsService.markAsRead(request.notificationId);
        case "markAllAsRead":
          return notificationActionsService.markAllAsRead();
        case "delete":
          return notificationActionsService.deleteNotification(request.notificationId);
        case "archive":
          return notificationActionsService.archiveNotification(request.notificationId);
      }
    },
  });

  return {
    notifications: visibleNotifications,
    /** Unfiltered, unsearched, unsorted — for lookups (e.g. Notification
     * Details resolving a specific id) that must not depend on the Center
     * screen's current filter/search/sort state. */
    allNotifications: notifications,
    totalCount: notifications.length,
    isLoading: listQuery.isLoading,
    isRefreshing: listQuery.isFetching && !listQuery.isLoading,
    error: listQuery.error
      ? new AppError(
          "notification_unavailable",
          safeMessageFor("notification_unavailable"),
          listQuery.error,
        )
      : null,
    refresh: async () => {
      await listQuery.refetch();
    },
    realtimeStatus,
    searchQuery,
    setSearchQuery,
    filter,
    setFilter,
    sortOrder,
    setSortOrder,
    performAction: (request: NotificationActionRequest) => actionMutation.mutateAsync(request),
    isActionPending: actionMutation.isPending,
    actionError: actionMutation.error ? mapNotificationError(actionMutation.error) : null,
  };
}
