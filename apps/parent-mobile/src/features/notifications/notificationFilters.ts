import { CATEGORY_LABELS, isUnread } from "./notificationClassification";
import type { NotificationCategory, ParentNotification } from "./notificationTypes";

/**
 * Notification filtering (Prompt 8) — no React/RN import, pure and
 * independently unit-tested.
 */
export type NotificationFilter =
  | "all"
  | { kind: "category"; category: NotificationCategory }
  | "unread"
  | "read"
  | "high_priority";

export interface NotificationFilterOption {
  filter: NotificationFilter;
  label: string;
}

/** The complete filter set this prompt's `<filtering>` instructions
 * specify — every category, plus unread/read/high-priority. Included even
 * though several categories (and "read") can never match real data (see
 * `notificationClassification.ts`'s `CATEGORIES_WITH_REAL_DATA` and
 * `isUnread`'s doc comment) — selecting one yields a true, not fabricated,
 * empty result, distinct from hiding the option entirely. */
export const NOTIFICATION_FILTER_OPTIONS: NotificationFilterOption[] = [
  { filter: "all", label: "All" },
  { filter: "unread", label: "Unread" },
  { filter: "read", label: "Read" },
  { filter: "high_priority", label: "High priority" },
  {
    filter: { kind: "category", category: "leave_approval" },
    label: CATEGORY_LABELS.leave_approval,
  },
  { filter: { kind: "category", category: "security" }, label: CATEGORY_LABELS.security },
  { filter: { kind: "category", category: "emergency" }, label: CATEGORY_LABELS.emergency },
  { filter: { kind: "category", category: "health" }, label: CATEGORY_LABELS.health },
  {
    filter: { kind: "category", category: "hostel_updates" },
    label: CATEGORY_LABELS.hostel_updates,
  },
  {
    filter: { kind: "category", category: "announcements" },
    label: CATEGORY_LABELS.announcements,
  },
];

export function filterNotifications(
  notifications: ParentNotification[],
  filter: NotificationFilter,
): ParentNotification[] {
  if (filter === "all") return notifications;
  if (filter === "unread") return notifications.filter(() => isUnread());
  // No notification has ever been marked read (isUnread is always true —
  // see notificationClassification.ts) — a true, not fabricated, empty
  // result until real read-state persistence exists.
  if (filter === "read") return notifications.filter(() => !isUnread());
  if (filter === "high_priority") return notifications.filter((n) => n.priority === "high");
  return notifications.filter((n) => n.category === filter.category);
}
