import { useEffect, useMemo, useRef } from "react";
import { ContentLayout } from "../layouts/ContentLayout";
import { getBreadcrumbTrail } from "../lib/navigation/navigationConfig";
import { useNotificationCenter } from "../contexts/NotificationContext";
import { useNotificationCenterState } from "../features/notifications";
import { useRealtimeConnectionProbe } from "../hooks/useRealtimeConnectionProbe";
import {
  NotificationList,
  NotificationDetail,
  NotificationFilterBar,
  NotificationSearch,
  NotificationSort,
  NotificationSelectionToolbar,
} from "../components/notifications";
import { Button } from "../components/ui";
import styles from "./NotificationsPage.module.css";

const REALTIME_LABEL: Record<string, string> = {
  idle: "Connecting…",
  subscribing: "Connecting…",
  subscribed: "Live",
  error: "Reconnecting…",
  closed: "Disconnected",
};

/**
 * Enterprise Notification Center (Phase 2, Prompt 6). Composes Prompt 4's
 * `ContentLayout` shell around the widgets in `components/notifications/`
 * — this page owns layout/composition and the two state layers described
 * in `docs/notification-center.md` §6: canonical data
 * (`useNotificationCenter`, shared with the Header badge and Dashboard
 * Home's metric) and page-local UI state (`useNotificationCenterState`:
 * filters/search/sort/selection/the open detail).
 *
 * `useRealtimeConnectionProbe` here is a SEPARATE probe instance from
 * Dashboard Home's own — safe because the two pages are mutually exclusive
 * routes (only one is ever mounted at a time), so this is not a duplicate
 * subscription in practice, only in source code shape (documented in
 * `docs/notification-center.md` §5).
 */
export default function NotificationsPage() {
  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    refresh,
    markAsRead,
    acknowledge,
    dismiss,
    archive,
    markAllAsRead,
  } = useNotificationCenter();

  const {
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
  } = useNotificationCenterState(notifications);

  const realtimeState = useRealtimeConnectionProbe();
  const layoutRef = useRef<HTMLDivElement>(null);
  const lastActiveIdRef = useRef<string | null>(null);

  const activeNotification = useMemo(
    () => notifications.find((n) => n.id === activeId) ?? null,
    [notifications, activeId],
  );

  // Focus management (§13/§34): when the detail panel closes, return focus
  // to the list row that opened it, matching `ProfileMenu`'s established
  // "return focus to the originating control" pattern rather than letting
  // focus fall back to the document body.
  useEffect(() => {
    if (activeId === null && lastActiveIdRef.current) {
      const id = lastActiveIdRef.current;
      lastActiveIdRef.current = null;
      layoutRef.current?.querySelector<HTMLElement>(`[data-notification-id="${id}"]`)?.focus();
    }
  }, [activeId]);

  function handleClose() {
    lastActiveIdRef.current = activeId;
    setActiveId(null);
  }

  const hasAnyFilterOrSearch =
    searchQuery.trim() !== "" ||
    filters.categories.length > 0 ||
    filters.priorities.length > 0 ||
    filters.unreadOnly;

  const emptyTitle =
    notifications.length === 0
      ? "You're all caught up"
      : hasAnyFilterOrSearch
        ? "No notifications match these filters"
        : "You're all caught up";
  const emptyDescription =
    notifications.length === 0
      ? "No notifications require your attention. The notification source is not yet connected — this will populate once a business module begins emitting events (see the Notification Center documentation)."
      : hasAnyFilterOrSearch
        ? "Try adjusting or clearing your filters or search."
        : undefined;

  function selectedIdList(): string[] {
    return Array.from(selectedIds);
  }

  return (
    <ContentLayout
      title="Notification Center"
      breadcrumb={getBreadcrumbTrail("notifications")}
      width="full"
      actions={
        <div className={styles.headerActions}>
          <span className={styles.realtimeStatus}>
            {REALTIME_LABEL[realtimeState] ?? "Unknown"}
          </span>
          {unreadCount > 0 && (
            <Button variant="secondary" onClick={markAllAsRead}>
              Mark all as read
            </Button>
          )}
          <Button variant="secondary" onClick={refresh}>
            Refresh
          </Button>
        </div>
      }
    >
      <div className={styles.page} ref={layoutRef}>
        <div className={styles.toolbarRow}>
          <NotificationSearch value={searchQuery} onChange={setSearchQuery} />
          <NotificationSort value={sortOrder} onChange={setSortOrder} />
        </div>

        <NotificationFilterBar filters={filters} onChange={setFilters} />

        <NotificationSelectionToolbar
          selectedCount={selectedIds.size}
          onMarkAsRead={() => markAsRead(selectedIdList())}
          onAcknowledge={() => acknowledge(selectedIdList())}
          onDismiss={() => dismiss(selectedIdList())}
          onArchive={() => archive(selectedIdList())}
          onClear={clearSelection}
        />

        <div
          className={[styles.layout, activeId ? styles.hasSelection : ""].filter(Boolean).join(" ")}
        >
          <div className={styles.listColumn}>
            <NotificationList
              notifications={visibleNotifications}
              selectedIds={selectedIds}
              activeId={activeId}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAllVisible}
              onOpen={setActiveId}
              loading={isLoading}
              error={error ? { message: error.userMessage, onRetry: refresh } : undefined}
              emptyTitle={emptyTitle}
              emptyDescription={emptyDescription}
            />
          </div>
          <div className={styles.detailColumn}>
            <NotificationDetail
              notification={activeNotification}
              onClose={handleClose}
              onMarkAsRead={markAsRead}
              onAcknowledge={acknowledge}
              onDismiss={dismiss}
              onArchive={archive}
            />
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
