import { buildNotificationDisplayContent } from "./notificationContent";
import type {
  NotificationCategory,
  NotificationDeliveryStatus,
  NotificationPriority,
  ParentNotification,
} from "./notificationTypes";

/**
 * Notification classification (Prompt 8) — no React/RN import, independently
 * unit-tested. Every function here derives from data this app can actually
 * read (`notifications_select_own_parent`/`_own_student` RLS — see
 * `notificationTypes.ts`); nothing here invents a backend concept.
 */

/** Raw shape as read directly from Supabase (`notifications` table columns,
 * snake_case as Postgres returns them) — the only fields this app is
 * permitted/able to use. Deliberately excludes `recipient_type`/
 * `recipient_id` (always "this caller", never worth surfacing) and `stage`/
 * `retry_count` (see the doc comment below on why `stage` is read but never
 * exposed). */
export interface RawNotificationRow {
  id: string;
  related_leave_request_id: string | null;
  related_library_pass_id: string | null;
  status: NotificationDeliveryStatus;
  created_at: string;
}

/** Only `"leave_approval"` is ever actually reachable from real data today.
 * `"library"` exists in the type/category taxonomy because the schema has a
 * `related_library_pass_id` column for it, but no library workflow is
 * implemented anywhere in this backend (`docs/product.md`'s "MVP modules" —
 * Digital Library Pass has no route/worker yet), so it can never actually
 * appear. Every other named category (Security, Emergency, Health, Hostel
 * Updates, Announcements, System) has zero backend representation of any
 * kind — no column, no enum value — and exists purely so the category/filter
 * UI can present this prompt's complete intended taxonomy; selecting one
 * always yields a true (not fabricated) empty result. */
export const CATEGORIES_WITH_REAL_DATA: readonly NotificationCategory[] = ["leave_approval"];

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  leave_approval: "Leave Approvals",
  security: "Security",
  emergency: "Emergency",
  health: "Health",
  hostel_updates: "Hostel Updates",
  announcements: "Announcements",
  system: "System",
  library: "Library",
  general: "General",
};

export const DELIVERY_STATUS_LABELS: Record<NotificationDeliveryStatus, string> = {
  queued: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  failed: "Delivery issue",
};

/** Derived from which related-entity column is set — never from `stage`
 * (see below). `related_leave_request_id` set → `"leave_approval"`;
 * `related_library_pass_id` set → `"library"` (never actually populated
 * today, per the doc comment above); neither set → `"general"` (a
 * defensive fallback for a row shape this app cannot otherwise classify —
 * not currently produced by any known backend path). */
export function deriveCategory(row: RawNotificationRow): NotificationCategory {
  if (row.related_leave_request_id) return "leave_approval";
  if (row.related_library_pass_id) return "library";
  return "general";
}

/** Leave-approval notifications are time-sensitive action items (this
 * prompt's own `<high_priority_leave_notifications>` instructions) — every
 * other category defaults to normal priority. This is the ONLY priority
 * signal this app has any real basis for; there is no backend-supplied
 * priority field of any kind. */
export function derivePriority(category: NotificationCategory): NotificationPriority {
  return category === "leave_approval" ? "high" : "normal";
}

/** A leave-approval notification is "actionable" — it has a real
 * destination (the existing `leave/[id]` route) the notification can safely
 * deep-link to. Every other category is not actionable today: no route
 * exists for library/security/etc. notifications, and this app must never
 * invent one (this prompt's explicit "do not invent an approval screen"
 * rule, generalized to every category). */
export function isActionable(notification: Pick<ParentNotification, "category">): boolean {
  return notification.category === "leave_approval";
}

/**
 * Whether a notification is "unread." Always `true` today — deliberately,
 * not an oversight. `notifications` has no read/unread column of any kind
 * (`packages/db/src/schema/notification.ts`'s full column list), no RLS
 * UPDATE grant for the `authenticated` role (only Fastify's service-role
 * writes `status`/`retry_count`/`sent_at`/`delivered_at`), and no Fastify
 * endpoint exists to persist a read-state transition. Since nothing has
 * ever been — or can currently be — marked read, the only honest answer is
 * that every notification remains unread; this is a true statement given
 * zero persistence, not a fabricated default. See
 * `src/services/notifications/notificationActions.ts` for why "Mark as
 * Read" is consequently exposed as an unavailable action, not a fake one.
 *
 * Takes no argument deliberately — the answer does not depend on which
 * notification is asked about, which is itself the point being documented. */
export function isUnread(): boolean {
  return true;
}

const VALID_DELIVERY_STATUSES: readonly NotificationDeliveryStatus[] = [
  "queued",
  "sent",
  "delivered",
  "failed",
];

/** Defensive shape guard for a raw Supabase row (Prompt 8's explicit
 * "unavailable/invalid notification data" card state). In practice every
 * row is DB-typed and this should always pass, but a malformed row (a
 * schema drift, a partial/corrupted response) is treated as data this app
 * cannot safely render rather than crashing the whole list — see
 * `notificationService.listNotifications()`, which filters these out and
 * logs a warning instead of throwing. */
export function isValidRawNotificationRow(row: unknown): row is RawNotificationRow {
  if (typeof row !== "object" || row === null) return false;
  const candidate = row as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    (candidate.related_leave_request_id === null ||
      typeof candidate.related_leave_request_id === "string") &&
    (candidate.related_library_pass_id === null ||
      typeof candidate.related_library_pass_id === "string") &&
    typeof candidate.status === "string" &&
    VALID_DELIVERY_STATUSES.includes(candidate.status as NotificationDeliveryStatus) &&
    typeof candidate.created_at === "string" &&
    !Number.isNaN(new Date(candidate.created_at).getTime())
  );
}

/** Maps one raw Supabase row into the client-side `ParentNotification` view
 * — the single place a raw row becomes what the UI renders. */
export function mapRowToNotification(row: RawNotificationRow): ParentNotification {
  const category = deriveCategory(row);
  const content = buildNotificationDisplayContent(category);
  return {
    id: row.id,
    category,
    priority: derivePriority(category),
    title: content.title,
    description: content.description,
    deliveryStatus: row.status,
    createdAt: row.created_at,
    relatedLeaveRequestId: row.related_leave_request_id,
  };
}
