import type { Permission } from "../../lib/authorization/permissions";
import type { DataAvailability } from "../../lib/dataAvailability";

/**
 * Notification domain model (Prompt 6 §6/§7). This is a UI/domain
 * interface, not a database schema — no table named anything like this
 * exists, and none is created by this prompt (§46). Every field here was
 * chosen because the prompt's own conceptual model names it AND a real or
 * plausible future producer could supply it; nothing here is invented
 * beyond what's needed to represent the categories/priorities/lifecycle
 * this prompt itself specifies.
 *
 * Field groups, matching §7's required distinctions:
 * - Identity: `id`
 * - Presentation: `title`, `message`, `category`, `priority`
 * - Lifecycle: `state`, `readAt`, `acknowledgedAt`, `completedAt`, `expiresAt`
 * - Source: `source`, `sourceReference` (opaque — never rendered as a raw
 *   database id; a future producer's own internal identifier, kept only so
 *   an action can navigate back to the right record)
 * - Action: `action`
 * - Timing: `createdAt`, `updatedAt`
 */

export const NOTIFICATION_CATEGORIES = [
  "parent_approval",
  "student_verification",
  "student_return",
  "student_exit",
  "emergency",
  "health",
  "system",
  "administrative",
  "security",
  "announcement",
  "audit",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_PRIORITIES = [
  "critical",
  "high",
  "medium",
  "low",
  "informational",
] as const;

export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

/**
 * Conceptual lifecycle (Prompt 6 §10). Not every notification uses every
 * state — a purely informational announcement, for instance, never becomes
 * `action_required`. No backend currently persists ANY of these
 * transitions (see `notificationService.ts`'s doc comment); until a real
 * producer/backend exists, every transition below is client-local
 * presentation state only, never a claimed server mutation.
 */
export const NOTIFICATION_LIFECYCLE_STATES = [
  "unread",
  "read",
  "acknowledged",
  "action_required",
  "completed",
  "expired",
  "dismissed",
  "archived",
] as const;

export type NotificationLifecycleState = (typeof NOTIFICATION_LIFECYCLE_STATES)[number];

/**
 * A navigation shortcut only (Prompt 6 §22) — never a source of
 * authorization. `requiredPermission` lets the UI hide an action the caller
 * could never use, but the destination route's OWN guard remains the real
 * authorization boundary regardless of whether this field is present or
 * correct.
 */
export interface NotificationAction {
  label: string;
  route: string;
  requiredPermission?: Permission;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  state: NotificationLifecycleState;
  createdAt: string;
  updatedAt?: string;
  /** Human-readable subsystem name (e.g. "Leave Management") — never a raw
   * internal service/table identifier. */
  source: string;
  /** Opaque reference to whatever record this notification is about (e.g. a
   * leave request id) — never displayed directly; only ever used, by a
   * future action, to navigate to that record's own page. */
  sourceReference?: string;
  readAt?: string;
  acknowledgedAt?: string;
  completedAt?: string;
  expiresAt?: string;
  action?: NotificationAction;
}

/**
 * Filter model (Prompt 6 §17). All six dimensions the prompt names are
 * represented in the type for extensibility; `dateRange`/`sources` have no
 * dedicated UI control in this pass (see `docs/notification-center.md` §7)
 * since there is no real data yet for either to meaningfully narrow —
 * modeled now so a future control can be added without a type change.
 */
export interface NotificationFilters {
  categories: NotificationCategory[];
  priorities: NotificationPriority[];
  states: NotificationLifecycleState[];
  unreadOnly: boolean;
  dateRange?: { from: string; to: string };
  sources?: string[];
}

export function emptyFilters(): NotificationFilters {
  return { categories: [], priorities: [], states: [], unreadOnly: false };
}

export type NotificationSortOrder = "newest" | "oldest" | "priority";

export interface NotificationCenterCapability {
  availability: DataAvailability;
  detail: string;
}
