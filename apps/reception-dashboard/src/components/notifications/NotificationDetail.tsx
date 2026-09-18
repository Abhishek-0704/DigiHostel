import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button, EmptyState, StatusBadge } from "../ui";
import { useAuthorization } from "../../contexts/AuthorizationContext";
import { NotificationCategoryBadge } from "./NotificationCategoryBadge";
import { NotificationPriorityBadge } from "./NotificationPriorityBadge";
import {
  NOTIFICATION_STATE_LABEL,
  NOTIFICATION_STATE_TONE,
} from "../../features/notifications/lifecycle";
import type { Notification } from "../../features/notifications/types";
import styles from "./NotificationDetail.module.css";

export interface NotificationDetailProps {
  notification: Notification | null;
  onClose: () => void;
  onMarkAsRead: (ids: string[]) => void;
  onAcknowledge: (ids: string[]) => void;
  onDismiss: (ids: string[]) => void;
  onArchive: (ids: string[]) => void;
}

/**
 * Reusable notification detail panel (Prompt 6 §13). On desktop this
 * renders in a persistent right-hand column (`NotificationsPage`'s CSS
 * decides the layout, this component only decides its own content); on
 * narrower widths the same component becomes the only thing shown, with a
 * Close button that returns focus to the originating list row (handled by
 * the parent page, which owns the ref to the row that was activated).
 *
 * Focus management: the close button receives focus whenever a NEW
 * notification is opened (not on every re-render) so a keyboard user
 * lands somewhere sensible immediately; Escape closes the panel from
 * anywhere inside it, mirroring `ProfileMenu`'s established pattern.
 */
export function NotificationDetail({
  notification,
  onClose,
  onMarkAsRead,
  onAcknowledge,
  onDismiss,
  onArchive,
}: NotificationDetailProps) {
  const navigate = useNavigate();
  const { hasPermission } = useAuthorization();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (notification) closeButtonRef.current?.focus();
  }, [notification?.id]);

  if (!notification) {
    return (
      <div className={styles.placeholder}>
        <EmptyState
          title="No notification selected"
          description="Select a notification from the list to view its details."
        />
      </div>
    );
  }

  const canUseAction =
    notification.action &&
    (!notification.action.requiredPermission ||
      hasPermission(notification.action.requiredPermission));

  return (
    <div
      className={styles.panel}
      role="region"
      aria-label={`Notification detail: ${notification.title}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className={styles.header}>
        <h2 className={styles.title}>{notification.title}</h2>
        <button
          ref={closeButtonRef}
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close notification detail"
        >
          ×
        </button>
      </div>

      <div className={styles.badges}>
        <NotificationCategoryBadge category={notification.category} />
        <NotificationPriorityBadge priority={notification.priority} />
        <StatusBadge
          label={NOTIFICATION_STATE_LABEL[notification.state]}
          tone={NOTIFICATION_STATE_TONE[notification.state]}
        />
      </div>

      <p className={styles.message}>{notification.message}</p>

      <dl className={styles.metaList}>
        <div className={styles.metaRow}>
          <dt>Source</dt>
          <dd>{notification.source}</dd>
        </div>
        <div className={styles.metaRow}>
          <dt>Created</dt>
          <dd>
            <time dateTime={notification.createdAt}>
              {new Date(notification.createdAt).toLocaleString()}
            </time>
          </dd>
        </div>
        {notification.readAt && (
          <div className={styles.metaRow}>
            <dt>Read</dt>
            <dd>
              <time dateTime={notification.readAt}>
                {new Date(notification.readAt).toLocaleString()}
              </time>
            </dd>
          </div>
        )}
        {notification.acknowledgedAt && (
          <div className={styles.metaRow}>
            <dt>Acknowledged</dt>
            <dd>
              <time dateTime={notification.acknowledgedAt}>
                {new Date(notification.acknowledgedAt).toLocaleString()}
              </time>
            </dd>
          </div>
        )}
        {notification.expiresAt && (
          <div className={styles.metaRow}>
            <dt>Expires</dt>
            <dd>
              <time dateTime={notification.expiresAt}>
                {new Date(notification.expiresAt).toLocaleString()}
              </time>
            </dd>
          </div>
        )}
      </dl>

      {canUseAction && notification.action && (
        <Button
          variant="primary"
          className={styles.actionButton}
          onClick={() => navigate(notification.action!.route)}
        >
          {notification.action.label}
        </Button>
      )}

      <div className={styles.footerActions}>
        {notification.state === "unread" && (
          <Button variant="secondary" onClick={() => onMarkAsRead([notification.id])}>
            Mark as read
          </Button>
        )}
        {notification.state !== "acknowledged" && (
          <Button variant="secondary" onClick={() => onAcknowledge([notification.id])}>
            Acknowledge
          </Button>
        )}
        <Button variant="ghost" onClick={() => onDismiss([notification.id])}>
          Dismiss
        </Button>
        <Button variant="ghost" onClick={() => onArchive([notification.id])}>
          Archive
        </Button>
      </div>
    </div>
  );
}
