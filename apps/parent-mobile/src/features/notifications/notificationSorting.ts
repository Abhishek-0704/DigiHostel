import { CATEGORY_LABELS, isUnread } from "./notificationClassification";
import type { ParentNotification } from "./notificationTypes";

/**
 * Notification sorting (Prompt 8) — no React/RN import, pure, deterministic,
 * never mutates the input array (returns a new array via `.slice().sort()`)
 * so it never interferes with TanStack Query's cached list identity.
 */
export type NotificationSortOrder = "newest" | "oldest" | "priority" | "category" | "unread_first";

export interface NotificationSortOption {
  order: NotificationSortOrder;
  label: string;
}

export const NOTIFICATION_SORT_OPTIONS: NotificationSortOption[] = [
  { order: "newest", label: "Newest first" },
  { order: "oldest", label: "Oldest first" },
  { order: "priority", label: "Priority" },
  { order: "category", label: "Category" },
  { order: "unread_first", label: "Unread first" },
];

function byNewest(a: ParentNotification, b: ParentNotification): number {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

const PRIORITY_RANK: Record<ParentNotification["priority"], number> = { high: 0, normal: 1 };

export function sortNotifications(
  notifications: ParentNotification[],
  order: NotificationSortOrder,
): ParentNotification[] {
  const copy = notifications.slice();
  switch (order) {
    case "newest":
      return copy.sort(byNewest);
    case "oldest":
      return copy.sort((a, b) => byNewest(b, a));
    case "priority":
      return copy.sort(
        (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || byNewest(a, b),
      );
    case "category":
      return copy.sort(
        (a, b) =>
          CATEGORY_LABELS[a.category].localeCompare(CATEGORY_LABELS[b.category]) || byNewest(a, b),
      );
    case "unread_first":
      // Every notification is unread today (see notificationClassification.ts's
      // isUnread doc comment) — this degenerates to a stable newest-first
      // order rather than a meaningless no-op, so the result stays useful
      // and deterministic until real read-state exists to actually
      // distinguish rows.
      return isUnread() ? copy.sort(byNewest) : copy;
    default:
      return copy;
  }
}
