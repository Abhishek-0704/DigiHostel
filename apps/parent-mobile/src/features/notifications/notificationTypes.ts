/**
 * Notification domain types (Prompt 8) — no React/RN import.
 *
 * Backed by a real table (`notifications` — `packages/db/src/schema/notification.ts`)
 * with a real RLS SELECT policy scoped to the caller's own parent/student id
 * (`notifications_select_own_parent`/`_own_student`). The row shape is
 * intentionally minimal (no title/body/category text column — see
 * `notificationContent.ts`), so `ParentNotification` below is a client-side
 * VIEW derived from the raw row, never a 1:1 mirror of it — no internal id
 * beyond what is needed for navigation, no escalation `stage`, no delivery
 * `retryCount` (see `notificationClassification.ts`'s doc comment on exactly
 * what is and isn't surfaced, and why).
 */

/**
 * The full category taxonomy this prompt specifies. Only `"leave_approval"`
 * can ever be produced from real data today — every other value exists so
 * the filter/category UI can present the complete, intended model (per this
 * prompt's own `<category model>` instructions), while `notificationClassification.ts`'s
 * `CATEGORIES_WITH_REAL_DATA` makes explicit which ones are honestly
 * reachable. Selecting a category with no real data yields a truthful empty
 * result, never a fabricated one.
 */
export type NotificationCategory =
  | "leave_approval"
  | "security"
  | "emergency"
  | "health"
  | "hostel_updates"
  | "announcements"
  | "system"
  | "library"
  | "general";

export type NotificationPriority = "high" | "normal";

/** Mirrors `notifications.status` (packages/db/src/schema/enums.ts,
 * `notification_status`) exactly — this is the backend's PUSH DELIVERY
 * pipeline status (did the Expo Push provider accept it), not a read/unread
 * concept. Safe to surface: it describes delivery mechanics visible to the
 * recipient anyway (did their device get a push), not internal escalation
 * detail. */
export type NotificationDeliveryStatus = "queued" | "sent" | "delivered" | "failed";

export interface ParentNotification {
  /** Opaque key for React lists/navigation params only — never rendered as
   * visible text (this prompt's explicit "do not expose internal database
   * IDs" rule). */
  id: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  description: string;
  deliveryStatus: NotificationDeliveryStatus;
  /** ISO 8601 — `notifications.created_at`, the one authoritative timestamp
   * every row has (`sentAt`/`deliveredAt` are nullable and delivery-pipeline
   * specific, not shown as "the" notification time). */
  createdAt: string;
  /** Opaque navigation param only, exactly like `id` — never rendered as
   * visible text. Null for any non-leave notification (none exist today —
   * see `notificationClassification.ts`). */
  relatedLeaveRequestId: string | null;
}
