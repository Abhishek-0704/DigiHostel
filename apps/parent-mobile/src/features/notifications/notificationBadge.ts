/**
 * Notification badge derivation (Prompt 8) — no React/RN import.
 *
 * Represents a TOTAL notification count, deliberately never labeled
 * "unread" in visible copy: `isUnread()` is always `true` today (no
 * read-state persistence exists — see `notificationClassification.ts`), so
 * a badge claiming to count "unread" items would technically equal the
 * total anyway, but calling it "unread" would overclaim a distinction this
 * app cannot make. The count itself is real (the length of the actually
 * fetched, RLS-scoped notification list) — never hard-coded, never
 * fabricated.
 */
export interface NotificationBadgeState {
  /** `null` when the count is not currently known (query hasn't completed,
   * or failed) — renders no numeric badge, distinct from a real `0`. */
  count: number | null;
  accessibilityLabel: string;
}

export function deriveNotificationBadge(
  notifications: readonly unknown[] | null,
): NotificationBadgeState {
  if (notifications === null) {
    return { count: null, accessibilityLabel: "Notification count unavailable" };
  }
  const count = notifications.length;
  if (count === 0) {
    return { count: 0, accessibilityLabel: "No notifications" };
  }
  if (count === 1) {
    return { count: 1, accessibilityLabel: "1 notification" };
  }
  return { count, accessibilityLabel: `${count} notifications` };
}
