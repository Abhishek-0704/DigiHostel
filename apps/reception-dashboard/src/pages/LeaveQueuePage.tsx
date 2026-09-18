import { useEffect, useMemo, useRef } from "react";
import { ContentLayout } from "../layouts/ContentLayout";
import { getBreadcrumbTrail } from "../lib/navigation/navigationConfig";
import { useAuthorization } from "../contexts/AuthorizationContext";
import { useLeaveQueue, useLeaveQueueState } from "../features/leave";
import { useLeaveQueueRealtime } from "../hooks";
import {
  QueueSummary,
  LeaveRequestTable,
  QueueSearch,
  QueueSort,
  QueueFilterBar,
  LeaveRequestDetailPanel,
} from "../components/leave";
import { Button } from "../components/ui";
import styles from "./LeaveQueuePage.module.css";

const REALTIME_LABEL: Record<string, string> = {
  connecting: "Connecting…",
  connected: "Live",
  disconnected: "Disconnected",
  unavailable: "Reconnecting…",
};

/**
 * Reception Leave Request Queue (Phase 3, Prompt 7A) — the operational
 * workspace reception staff use to view, search, filter, sort, and inspect
 * outgoing student leave requests. Composes Prompt 4's `ContentLayout`
 * shell around the widgets in `components/leave/` — this page owns
 * layout/composition and the two state layers `docs/leave-queue.md` §6
 * describes: server state (`useLeaveQueue`, the real, hostel-scoped queue
 * fetched from `GET /leave-requests/queue`) and page-local UI state
 * (`useLeaveQueueState`: filters/search/sort/selection/the open detail),
 * mirroring the Notification Center's identical two-layer split (Prompt 6).
 *
 * Real business-table realtime: `useLeaveQueueRealtime` subscribes to
 * `leave_requests` changes and triggers a real query invalidation/refetch —
 * distinct from Dashboard Home's/the Notification Center's own
 * business-table-agnostic connection probes, since this page has a genuine
 * event source (see the hook's own doc comment for the RLS-scoping
 * argument).
 *
 * No Parent Approval Session is created or triggered anywhere on this page
 * (Prompt 7B's boundary, preserved — see `LeaveRequestDetailPanel`'s own
 * doc comment for the always-disabled future action).
 */
export default function LeaveQueuePage() {
  const { items, isLoading, error, refresh } = useLeaveQueue();
  const {
    filters,
    setFilters,
    searchQuery,
    setSearchQuery,
    sortOrder,
    setSortOrder,
    visibleItems,
    activeId,
    setActiveId,
  } = useLeaveQueueState(items);
  const { role, hostelId } = useAuthorization();

  const realtimeState = useLeaveQueueRealtime(() => {
    void refresh();
  });

  const layoutRef = useRef<HTMLDivElement>(null);
  const lastActiveIdRef = useRef<string | null>(null);

  const activeItem = useMemo(
    () => items.find((item) => item.id === activeId) ?? null,
    [items, activeId],
  );

  // Focus management (§28/§34): return focus to the originating row when the
  // detail panel closes, mirroring the Notification Center's established
  // pattern exactly.
  useEffect(() => {
    if (activeId === null && lastActiveIdRef.current) {
      const id = lastActiveIdRef.current;
      lastActiveIdRef.current = null;
      layoutRef.current?.querySelector<HTMLElement>(`[data-leave-request-id="${id}"]`)?.focus();
    }
  }, [activeId]);

  function handleClose() {
    lastActiveIdRef.current = activeId;
    setActiveId(null);
  }

  const hasAnyFilterOrSearch =
    searchQuery.trim() !== "" || filters.statuses.length > 0 || filters.unresolvedOnly;

  const emptyTitle =
    items.length === 0
      ? "No leave requests"
      : hasAnyFilterOrSearch
        ? "No leave requests match these filters"
        : "No leave requests";
  const emptyDescription =
    items.length === 0
      ? "No students in your assigned scope currently have an open leave request."
      : hasAnyFilterOrSearch
        ? "Try adjusting or clearing your filters or search."
        : undefined;

  return (
    <ContentLayout
      title="Leave Requests"
      description="Reception operations queue for outgoing student leave requests."
      breadcrumb={getBreadcrumbTrail("leave-queue")}
      width="full"
      actions={
        <div className={styles.headerActions}>
          <span className={styles.scopeIndicator}>
            {role === "super_admin" ? "All hostels" : hostelId ? "Hostel-scoped" : "Unscoped"}
          </span>
          <span className={styles.realtimeStatus}>
            {REALTIME_LABEL[realtimeState] ?? "Unknown"}
          </span>
          <Button variant="secondary" onClick={() => void refresh()}>
            Refresh
          </Button>
        </div>
      }
    >
      <div className={styles.page} ref={layoutRef}>
        <QueueSummary items={items} now={new Date()} />

        <div className={styles.toolbarRow}>
          <QueueSearch value={searchQuery} onChange={setSearchQuery} />
          <QueueSort value={sortOrder} onChange={setSortOrder} />
        </div>

        <QueueFilterBar filters={filters} onChange={setFilters} />

        <div
          className={[styles.layout, activeId ? styles.hasSelection : ""].filter(Boolean).join(" ")}
        >
          <div className={styles.listColumn}>
            <LeaveRequestTable
              items={visibleItems}
              activeId={activeId}
              onOpen={setActiveId}
              loading={isLoading}
              error={error ? { message: error.userMessage, onRetry: refresh } : undefined}
              emptyTitle={emptyTitle}
              emptyDescription={emptyDescription}
            />
          </div>
          <div className={styles.detailColumn}>
            <LeaveRequestDetailPanel item={activeItem} onClose={handleClose} />
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
