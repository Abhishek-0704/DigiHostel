import type { ComponentType } from "react";
import {
  DashboardIcon,
  LeaveIcon,
  StudentsIcon,
  EmergencyIcon,
  HealthIcon,
  ReportsIcon,
  AuditIcon,
  AdminIcon,
  ConfigurationIcon,
  SystemIcon,
  BellIcon,
  SettingsIcon,
  HelpIcon,
  type IconProps,
} from "../../components/icons";
import { ROUTES } from "../../constants/routes";
import type { Permission } from "../authorization/permissions";

/**
 * Centralized navigation model (Prompt 4 §9) — the single source every
 * consumer (Sidebar, breadcrumbs, and any future navigation surface) reads
 * from, so a route's label/icon/group/permission is never typed a second
 * time. Deliberately a plain, static, strongly-typed data structure (no
 * navigation "engine") — matches this app's own established precedent for
 * `lib/authorization/policy.ts`'s static role→permission table: the
 * smallest model that is still centralized and testable, not a speculative
 * framework (§42 — "avoid over-engineering").
 *
 * Every `route`/`requiredPermission` value here references the ALREADY
 * real `ROUTES`/`Permission` constants (Prompt 0.2/3) — nothing here
 * invents a route or a permission that doesn't already exist in the
 * accepted architecture (§41's explicit rule).
 *
 * Deliberately excludes two real, permission-gated routes:
 * `ROUTES.leaveDetail` (`/leave/:id`) and `ROUTES.studentVerification`
 * (`/students/:rollNumber/verification`) — both are parameterized,
 * reached contextually from their parent list/profile page (the Leave
 * Queue row, the Student Profile page), never as a standalone global
 * destination. Adding them here would produce a sidebar link with no
 * concrete target to navigate to, which is not what a primary-navigation
 * item is for. This is a deliberate navigation-architecture decision, not
 * an oversight — see `docs/dashboard-shell.md`.
 */

export type NavigationGroupId = "leave" | "reports" | "administration";

export interface NavigationGroup {
  id: NavigationGroupId;
  label: string;
}

export const NAVIGATION_GROUPS: readonly NavigationGroup[] = [
  { id: "leave", label: "Leave Management" },
  { id: "reports", label: "Reports" },
  { id: "administration", label: "Administration" },
];

export interface NavigationItem {
  id: string;
  label: string;
  /** Distinct from `label` only when a shorter/clearer breadcrumb phrasing
   * is warranted (Prompt 4 §12/§9 — "breadcrumb metadata"). Defaults to
   * `label` via `getBreadcrumbTrail` below when omitted. */
  breadcrumbLabel?: string;
  route: string;
  icon: ComponentType<IconProps>;
  /** A single required permission, matching this app's existing
   * `RequirePermission`/route-wiring convention (`routes/index.tsx`) — one
   * permission per route, not a set, since no current route needs more
   * than one. Extend to `Permission[]` only when a real route needs it. */
  requiredPermission?: Permission;
  /** Undefined = a top-level item, rendered directly (not inside a
   * collapsible group) — used for single-item categories (Dashboard,
   * Notifications, Students, Emergency, Health) where a dedicated group
   * header would add chrome without organizing anything real (§8's own
   * "avoid over-componentization" spirit applied to information
   * architecture, not just components). */
  group?: NavigationGroupId;
}

export const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    route: ROUTES.dashboard,
    icon: DashboardIcon,
    requiredPermission: "dashboard:view",
  },
  {
    id: "notifications",
    label: "Notifications",
    route: ROUTES.notifications,
    icon: BellIcon,
    requiredPermission: "notifications:view",
  },
  {
    id: "students",
    label: "Students",
    route: ROUTES.students,
    icon: StudentsIcon,
    requiredPermission: "student:search",
  },
  {
    id: "emergency",
    label: "Emergency",
    route: ROUTES.emergency,
    icon: EmergencyIcon,
    requiredPermission: "emergency:manage",
  },
  {
    id: "health",
    label: "Health",
    route: ROUTES.health,
    icon: HealthIcon,
    requiredPermission: "health:manage",
  },

  {
    id: "leave-queue",
    label: "Leave Queue",
    route: ROUTES.leaveQueue,
    icon: LeaveIcon,
    requiredPermission: "leave:queue:view",
    group: "leave",
  },
  {
    id: "approval-history",
    label: "Approval History",
    route: ROUTES.approvalHistory,
    icon: LeaveIcon,
    requiredPermission: "leave:parent_approval:monitor",
    group: "leave",
  },

  {
    id: "reports",
    label: "Reports",
    route: ROUTES.reports,
    icon: ReportsIcon,
    requiredPermission: "reports:view",
    group: "reports",
  },
  {
    id: "analytics",
    label: "Analytics",
    route: ROUTES.analytics,
    icon: ReportsIcon,
    requiredPermission: "reports:view",
    group: "reports",
  },

  {
    id: "audit",
    label: "Audit Logs",
    route: ROUTES.audit,
    icon: AuditIcon,
    requiredPermission: "audit:view",
    group: "administration",
  },
  {
    id: "users",
    label: "Users",
    route: ROUTES.users,
    icon: AdminIcon,
    requiredPermission: "users:manage",
    group: "administration",
  },
  {
    id: "configuration",
    label: "Configuration",
    route: ROUTES.configuration,
    icon: ConfigurationIcon,
    requiredPermission: "configuration:manage",
    group: "administration",
  },
  {
    id: "system",
    label: "System Health",
    route: ROUTES.system,
    icon: SystemIcon,
    requiredPermission: "system:view",
    group: "administration",
  },
] as const;

/** Ungated items rendered unconditionally at the foot of the sidebar
 * (unchanged from Prompt 0.2/3's own convention — personal-account/
 * universally-accessible pages, not administrative modules gated by
 * permission). Kept out of `NAVIGATION_ITEMS`/permission filtering
 * entirely, matching `Sidebar.tsx`'s existing documented reasoning. */
export const UNGATED_NAVIGATION_ITEMS: readonly Omit<
  NavigationItem,
  "requiredPermission" | "group"
>[] = [
  { id: "settings", label: "Settings", route: ROUTES.settings, icon: SettingsIcon },
  { id: "help", label: "Help & Support", route: ROUTES.help, icon: HelpIcon },
];

/**
 * Breadcrumb trail for a navigation item, by id — "Dashboard" is always the
 * root (matches `ROUTES.dashboard` being this app's actual landing route,
 * `routes/index.tsx`'s `Navigate to={ROUTES.dashboard}`), with the item's
 * own group (if any) and then the item itself. `dynamicLabel` lets a future
 * detail page (e.g. a specific student's profile) inject a real label for
 * its final segment without this module needing to know about business
 * data (§12 — "dynamic labels must be injectable later... do not make
 * business API calls merely to create placeholder breadcrumbs").
 */
export interface BreadcrumbTrailSegment {
  label: string;
  to?: string;
}

export function getBreadcrumbTrail(
  itemId: string,
  dynamicLabel?: string,
): BreadcrumbTrailSegment[] {
  const ungated = UNGATED_NAVIGATION_ITEMS.find((candidate) => candidate.id === itemId);
  if (ungated) {
    const trail: BreadcrumbTrailSegment[] = [{ label: "Dashboard", to: ROUTES.dashboard }];
    trail.push(
      dynamicLabel ? { label: ungated.label, to: ungated.route } : { label: ungated.label },
    );
    if (dynamicLabel) trail.push({ label: dynamicLabel });
    return trail;
  }

  const item = NAVIGATION_ITEMS.find((candidate) => candidate.id === itemId);
  if (!item) return dynamicLabel ? [{ label: dynamicLabel }] : [];

  const trail: BreadcrumbTrailSegment[] = [];
  if (item.id !== "dashboard") {
    trail.push({ label: "Dashboard", to: ROUTES.dashboard });
  }
  if (item.group) {
    const group = NAVIGATION_GROUPS.find((candidate) => candidate.id === item.group);
    if (group) trail.push({ label: group.label });
  }
  const itemLabel = item.breadcrumbLabel ?? item.label;
  if (dynamicLabel) {
    // A more specific page follows this item (e.g. one particular
    // student's profile) — the item itself becomes a link, and the
    // dynamic label is the final, current segment.
    trail.push({ label: itemLabel, to: item.route });
    trail.push({ label: dynamicLabel });
  } else {
    trail.push({ label: itemLabel });
  }
  return trail;
}
