import { Button } from "../ui";
import styles from "./NotificationSelectionToolbar.module.css";

export interface NotificationSelectionToolbarProps {
  selectedCount: number;
  onMarkAsRead: () => void;
  onAcknowledge: () => void;
  onDismiss: () => void;
  onArchive: () => void;
  onClear: () => void;
}

/**
 * Bulk-action toolbar (Prompt 6 §21). Rendered only while at least one
 * notification is selected. Every action here mutates the same
 * client-local lifecycle state `NotificationDetail`'s per-item actions do
 * (`NotificationContext`) — there is no separate "bulk backend" to call,
 * consistent with this prompt's own "a disabled/not-connected action is
 * preferable to a false success toast" (no toast is shown implying
 * persistence; the list re-renders with the real, local state change).
 */
export function NotificationSelectionToolbar({
  selectedCount,
  onMarkAsRead,
  onAcknowledge,
  onDismiss,
  onArchive,
  onClear,
}: NotificationSelectionToolbarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Bulk notification actions">
      <span className={styles.count}>{selectedCount} selected</span>
      <Button variant="secondary" onClick={onMarkAsRead}>
        Mark as read
      </Button>
      <Button variant="secondary" onClick={onAcknowledge}>
        Acknowledge
      </Button>
      <Button variant="ghost" onClick={onDismiss}>
        Dismiss
      </Button>
      <Button variant="ghost" onClick={onArchive}>
        Archive
      </Button>
      <Button variant="ghost" onClick={onClear}>
        Clear selection
      </Button>
    </div>
  );
}
