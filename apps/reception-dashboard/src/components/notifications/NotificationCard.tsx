import { StatusBadge } from "../ui";
import { NotificationCategoryBadge } from "./NotificationCategoryBadge";
import { NotificationPriorityBadge } from "./NotificationPriorityBadge";
import { NotificationUnreadIndicator } from "./NotificationUnreadIndicator";
import type { Notification } from "../../features/notifications/types";
import styles from "./NotificationCard.module.css";

export interface NotificationCardProps {
  notification: Notification;
  selected: boolean;
  active: boolean;
  onSelectChange: (checked: boolean) => void;
  onOpen: () => void;
}

/**
 * Reusable notification list row (Prompt 6 §12). Kept scannable: title,
 * a single-line message preview, category/priority badges, source, and
 * timestamp — no raw metadata rendered (§12's explicit "avoid displaying
 * raw metadata by default"). Selection (a real checkbox, not the whole row)
 * and "open detail" (the row button) are separate controls so neither
 * gesture accidentally triggers the other.
 */
export function NotificationCard({
  notification,
  selected,
  active,
  onSelectChange,
  onOpen,
}: NotificationCardProps) {
  const unread = notification.state === "unread";

  return (
    <li className={[styles.item, active ? styles.active : ""].filter(Boolean).join(" ")}>
      <input
        type="checkbox"
        className={styles.checkbox}
        checked={selected}
        onChange={(e) => onSelectChange(e.target.checked)}
        aria-label={`Select notification: ${notification.title}`}
      />
      <button
        type="button"
        className={styles.main}
        onClick={onOpen}
        aria-current={active ? "true" : undefined}
        data-notification-id={notification.id}
      >
        <span className={styles.indicatorSlot}>{unread && <NotificationUnreadIndicator />}</span>
        <span className={styles.body}>
          <span className={styles.titleRow}>
            <span className={styles.title}>{notification.title}</span>
            <time className={styles.timestamp} dateTime={notification.createdAt}>
              {new Date(notification.createdAt).toLocaleString()}
            </time>
          </span>
          <span className={styles.message}>{notification.message}</span>
          <span className={styles.meta}>
            <NotificationCategoryBadge category={notification.category} />
            <NotificationPriorityBadge priority={notification.priority} />
            {notification.state === "action_required" && (
              <StatusBadge label="Action required" tone="warning" />
            )}
            <span className={styles.source}>{notification.source}</span>
          </span>
        </span>
      </button>
    </li>
  );
}
