import { NOTIFICATION_PRIORITY_META } from "./priorities";
import { compareNotifications } from "./notificationMerge";
import type { Notification, NotificationFilters, NotificationSortOrder } from "./types";

/**
 * Pure filter/search/sort layer (Prompt 6 §17/§18/§19). Deliberately
 * framework-agnostic (no React) so it is directly unit-testable and so
 * filter components never own data-fetching themselves (§17 — "filters
 * should operate against the notification query/state layer," not the
 * other way around).
 *
 * Search is a plain in-memory substring match over `title`/`message`/
 * `source` only (§18 — never internal metadata) because every current
 * notification list is local/in-memory (see `notificationService.ts`) —
 * no debounce/async machinery is introduced since there is no actual
 * asynchronous search boundary yet. A future server-side search
 * implementation would replace this function's body, not its callers.
 */
export function matchesFilters(notification: Notification, filters: NotificationFilters): boolean {
  if (filters.unreadOnly && notification.state !== "unread") return false;
  if (filters.categories.length > 0 && !filters.categories.includes(notification.category)) {
    return false;
  }
  if (filters.priorities.length > 0 && !filters.priorities.includes(notification.priority)) {
    return false;
  }
  if (filters.states.length > 0 && !filters.states.includes(notification.state)) {
    return false;
  }
  return true;
}

export function matchesSearch(notification: Notification, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") return true;
  return (
    notification.title.toLowerCase().includes(trimmed) ||
    notification.message.toLowerCase().includes(trimmed) ||
    notification.source.toLowerCase().includes(trimmed)
  );
}

export function sortByOrder(
  notifications: readonly Notification[],
  order: NotificationSortOrder,
): Notification[] {
  const copy = [...notifications];
  if (order === "oldest") {
    return copy.sort((a, b) => -compareNotifications(a, b));
  }
  if (order === "priority") {
    return copy.sort((a, b) => {
      const byPriority =
        NOTIFICATION_PRIORITY_META[a.priority].weight -
        NOTIFICATION_PRIORITY_META[b.priority].weight;
      return byPriority !== 0 ? byPriority : compareNotifications(a, b);
    });
  }
  return copy.sort(compareNotifications);
}

export function applyNotificationView(
  notifications: readonly Notification[],
  filters: NotificationFilters,
  searchQuery: string,
  sortOrder: NotificationSortOrder,
): Notification[] {
  const filtered = notifications.filter(
    (n) => matchesFilters(n, filters) && matchesSearch(n, searchQuery),
  );
  return sortByOrder(filtered, sortOrder);
}
