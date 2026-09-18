import { EmptyState, ErrorState, Skeleton } from "../ui";
import { NotificationCard } from "./NotificationCard";
import type { Notification } from "../../features/notifications/types";
import styles from "./NotificationList.module.css";

export interface NotificationListProps {
  notifications: Notification[];
  selectedIds: ReadonlySet<string>;
  activeId: string | null;
  onToggleSelect: (id: string, checked: boolean) => void;
  onToggleSelectAll: (checked: boolean) => void;
  onOpen: (id: string) => void;
  loading?: boolean;
  error?: { message: string; onRetry?: () => void };
  emptyTitle: string;
  emptyDescription?: string;
}

/**
 * Reusable notification list (Prompt 6 §12/§20/§30). Reuses `Skeleton`/
 * `ErrorState`/`EmptyState` (Prompt 0.2) rather than duplicating them
 * (§37). No pagination/virtualization is implemented — every current
 * dataset is empty or test-sized (§20 — "do not implement a complicated
 * pagination system if no real backend data source currently exists"); the
 * plain-array prop shape here does not prevent a future cursor-paginated
 * caller from slotting in without this component changing.
 */
export function NotificationList({
  notifications,
  selectedIds,
  activeId,
  onToggleSelect,
  onToggleSelectAll,
  onOpen,
  loading,
  error,
  emptyTitle,
  emptyDescription,
}: NotificationListProps) {
  if (loading) {
    return (
      <div className={styles.skeletons} aria-busy="true" aria-label="Loading notifications">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={styles.skeletonRow}>
            <Skeleton height={14} width="40%" />
            <Skeleton height={12} width="80%" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error.message} onRetry={error.onRetry} />;
  }

  if (notifications.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  const allSelected = notifications.length > 0 && notifications.every((n) => selectedIds.has(n.id));

  return (
    <div className={styles.wrapper}>
      <div className={styles.selectAllRow}>
        <input
          type="checkbox"
          checked={allSelected}
          onChange={(e) => onToggleSelectAll(e.target.checked)}
          aria-label="Select all visible notifications"
        />
        <span>Select all visible ({notifications.length})</span>
      </div>
      <ul className={styles.list}>
        {notifications.map((notification) => (
          <NotificationCard
            key={notification.id}
            notification={notification}
            selected={selectedIds.has(notification.id)}
            active={activeId === notification.id}
            onSelectChange={(checked) => onToggleSelect(notification.id, checked)}
            onOpen={() => onOpen(notification.id)}
          />
        ))}
      </ul>
    </div>
  );
}
