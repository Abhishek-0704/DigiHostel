/** Mirrors `apps/api/src/domain/profile/types.ts`'s `NOTIFICATION_CATEGORIES`/
 * `MANDATORY_NOTIFICATION_CATEGORIES` exactly (not generated — the OpenAPI
 * schema for `notificationPreferences` is a plain `additionalProperties:
 * boolean` map, since the category set is a product-layer concept, not a
 * wire-format one; this file is this frontend's own small, explicit copy,
 * matching the backend's allow-list one-for-one). Labels are UI-only. */
export const NOTIFICATION_CATEGORIES = [
  "emergency_alert",
  "health_alert",
  "parent_approval",
  "leave_authorization",
  "student_movement",
  "administrative",
  "audit",
  "system_maintenance",
] as const;

export const MANDATORY_NOTIFICATION_CATEGORIES: readonly string[] = [
  "emergency_alert",
  "health_alert",
];

export const NOTIFICATION_CATEGORY_LABELS: Record<
  (typeof NOTIFICATION_CATEGORIES)[number],
  string
> = {
  emergency_alert: "Emergency alerts",
  health_alert: "Health alerts",
  parent_approval: "Parent approval updates",
  leave_authorization: "Leave authorization updates",
  student_movement: "Student movement updates",
  administrative: "Administrative notifications",
  audit: "Audit notifications",
  system_maintenance: "System maintenance notices",
};
