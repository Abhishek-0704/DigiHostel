import {
  LeaveIcon,
  StudentsIcon,
  EmergencyIcon,
  HealthIcon,
  ReportsIcon,
} from "../../components/icons";
import { ROUTES } from "../../constants/routes";
import type { Permission } from "../../lib/authorization/permissions";
import type { QuickActionDefinition } from "./types";

/**
 * Quick Action catalog (Prompt 5 §9/§27/§38). Every entry is a navigation
 * shortcut to an EXISTING route already defined in `ROUTES` and gated by an
 * EXISTING permission from `lib/authorization/permissions.ts` — nothing here
 * invents a route or a permission, and nothing here implements the
 * destination module itself (§38's "Correct: metric/placeholder → Open
 * Leave Queue" pattern, never "fetch parent contacts / initiate approval").
 *
 * Two of the prompt's own suggested actions are deliberately NOT included:
 *
 * - **Verify Student** — `ROUTES.studentVerification` (`/students/:rollNumber/verification`)
 *   is parameterized; there is no generic "verify a student" destination to
 *   navigate to without already knowing which student, exactly the same
 *   reasoning `lib/navigation/navigationConfig.ts` already applied when it
 *   excluded this same route from the primary sidebar (Prompt 4). An
 *   operator reaches verification from a specific student's profile, not
 *   from a dashboard shortcut. "Search Student" below is the correct
 *   dashboard-level entry point into that flow.
 * - **Announcements** — no `ROUTES.announcements` (or any announcement page)
 *   exists anywhere in this router; fabricating a destination for it would
 *   violate §38's "must not fabricate a route" rule. The inline
 *   `AnnouncementsPanel` on this page is the only place announcements
 *   appear until a real announcement module/route is designed.
 */
export const QUICK_ACTIONS: readonly QuickActionDefinition[] = [
  {
    id: "open-leave-queue",
    label: "Open Leave Queue",
    description: "Review and act on pending leave requests.",
    icon: LeaveIcon,
    route: ROUTES.leaveQueue,
    requiredPermission: "leave:queue:view",
  },
  {
    id: "search-student",
    label: "Search Student",
    description: "Find a student profile or begin verification.",
    icon: StudentsIcon,
    route: ROUTES.students,
    requiredPermission: "student:search",
  },
  {
    id: "emergency-response",
    label: "Emergency Response",
    description: "Open the emergency management module.",
    icon: EmergencyIcon,
    route: ROUTES.emergency,
    requiredPermission: "emergency:manage",
  },
  {
    id: "health-alerts",
    label: "Health Alerts",
    description: "Open the health alert module.",
    icon: HealthIcon,
    route: ROUTES.health,
    requiredPermission: "health:manage",
  },
  {
    id: "reports",
    label: "Reports",
    description: "Open reporting and analytics.",
    icon: ReportsIcon,
    route: ROUTES.reports,
    requiredPermission: "reports:view",
  },
] as const;

/**
 * Permission-filtered, in the same spirit as `useVisibleNavigation` (Prompt
 * 4 §27 — "AuthorizationContext → Quick Action Resolver → Visible Actions →
 * Existing Route Guard"). A plain function, not a hook, since the filtering
 * itself needs no React lifecycle — the caller passes in the same
 * `hasPermission` every other authorization consumer already uses.
 */
export function getVisibleQuickActions(
  hasPermission: (permission: Permission) => boolean,
): readonly QuickActionDefinition[] {
  return QUICK_ACTIONS.filter((action) => hasPermission(action.requiredPermission));
}
