import { CATEGORY_LABELS, DELIVERY_STATUS_LABELS } from "./notificationClassification";
import type { ParentNotification } from "./notificationTypes";

/**
 * Notification search (Prompt 8) — no React/RN import, local-only.
 *
 * Runs entirely against the already-fetched/cached notification list — no
 * server-side search endpoint exists (no Fastify notification route at
 * all — see `docs/notifications.md`'s capability matrix). This is safe
 * precisely because the underlying dataset is small and bounded: it is one
 * parent's own notification rows, not a global table, and
 * `notificationService.listNotifications()` applies its own bounded
 * `limit`/order rather than loading unbounded history (see that service's
 * own doc comment).
 *
 * Matches against title, description, category label, and delivery-status
 * label — NOT "student name" (a field this prompt's own test list
 * mentions): no student name is available anywhere in this app's data (see
 * `notificationContent.ts`'s doc comment), so a student-name search
 * dimension would have nothing real to match against. Documented here
 * rather than silently omitted.
 */
export function searchNotifications(
  notifications: ParentNotification[],
  query: string,
): ParentNotification[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length === 0) return notifications;

  return notifications.filter((notification) => {
    const haystack = [
      notification.title,
      notification.description,
      CATEGORY_LABELS[notification.category],
      DELIVERY_STATUS_LABELS[notification.deliveryStatus],
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(trimmed);
  });
}
