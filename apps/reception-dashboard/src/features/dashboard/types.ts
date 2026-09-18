import type { ComponentType } from "react";
import type { IconProps } from "../../components/icons";
import type { Permission } from "../../lib/authorization/permissions";
import type { StatusTone } from "../../components/ui";
import type { DataAvailability } from "../../lib/dataAvailability";

// Re-exported for backward compatibility — every existing import of
// `DataAvailability` from this module keeps working unchanged. The
// definition itself now lives in `lib/dataAvailability.ts` (Prompt 6 §5) so
// `features/notifications` can share the identical concept instead of
// redefining it. See `apps/reception-dashboard/docs/dashboard-home.md` for
// the full, evidence-based classification of every widget on this page.
export type { DataAvailability };

export interface MetricCardData {
  id: string;
  label: string;
  /** `null` whenever `availability` is not `"real"` — the card must never
   * show a fabricated number (Prompt 5 §7/§34's central rule). */
  value: number | null;
  availability: DataAvailability;
  /** Shown instead of a value when `value` is `null` — must name WHY the
   * data is unavailable and, where applicable, which future module owns it
   * (Prompt 5 §21 — "these states have different operational meanings"). */
  unavailableReason?: string;
  tone: StatusTone;
  icon: ComponentType<IconProps>;
  /** Optional navigation target — reuses the existing router, never a
   * business action itself (Prompt 5 §38). */
  route?: string;
  /** Permission required to navigate via `route`, matching this app's
   * existing `RequirePermission`/navigation-model convention. `undefined`
   * means the card itself carries no navigation. */
  requiredPermission?: Permission;
}

export interface QuickActionDefinition {
  id: string;
  label: string;
  description: string;
  icon: ComponentType<IconProps>;
  route: string;
  requiredPermission: Permission;
}

export type SystemHealthStatus =
  "operational" | "degraded" | "unavailable" | "unknown" | "not_configured";

export interface SystemHealthRow {
  id: string;
  label: string;
  status: SystemHealthStatus;
  detail: string;
  availability: DataAvailability;
}

/** Shared shape for the three "future" panels (Pending Work, Activity Feed,
 * Announcements) — every one of them is architecturally ready to show real
 * items the instant a real source exists, but none does yet (Prompt 5
 * §10/§11/§12). `items` stays empty in practice until a future prompt wires
 * a real source through the same hook. */
export interface FuturePanelState<TItem> {
  availability: DataAvailability;
  items: TItem[];
}

export type TaskPriority = "critical" | "time_sensitive" | "waiting" | "informational";

/** The shape a future Leave Management/Student Verification prompt will
 * populate `usePendingWork` with — defined now so that prompt only has to
 * supply data, not redesign `PendingWorkPanel`/`TaskItem` (Prompt 5 §10/§35). */
export interface TaskItemData {
  id: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  occurredAt?: string;
  route?: string;
}

export type ActivityEventType =
  | "student_exit"
  | "student_return"
  | "parent_approved"
  | "parent_rejected"
  | "verification_completed"
  | "emergency_alert"
  | "health_alert"
  | "audit_event";

/** The shape a future module will populate `useActivityFeed` with — see
 * `TaskItemData`'s doc comment for the same rationale (Prompt 5 §11/§35). */
export interface ActivityItemData {
  id: string;
  type: ActivityEventType;
  description: string;
  occurredAt: string;
  status?: string;
}

export type AnnouncementCategory = "hostel_notice" | "administrative" | "maintenance";

/** The shape a future announcement service will populate `useAnnouncements`
 * with (Prompt 5 §12/§35). */
export interface AnnouncementData {
  id: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  publishedAt: string;
}
