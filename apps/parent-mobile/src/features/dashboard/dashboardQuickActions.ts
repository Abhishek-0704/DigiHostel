import type { Href } from "expo-router";

/**
 * Quick Actions configuration (Prompt 7) — no React/RN import, independently
 * unit-tested (the `Href` import is type-only and erased at compile time,
 * same pattern already used by `src/navigation/routeGuard.ts`).
 *
 * Every `route` here is a real, already-implemented destination — either a
 * tab (Notifications, History) or an existing route group (Security Center,
 * Help). None of these targets is a placeholder invented for this list; they
 * are the same routes already registered in `app/(app)/_layout.tsx` and
 * `app/(app)/(tabs)/_layout.tsx`. Adding a future module's quick action is a
 * one-entry addition here, not a dashboard restructure.
 */
export interface DashboardQuickAction {
  id: string;
  title: string;
  description: string;
  route: Href;
  accessibilityHint: string;
}

export const DASHBOARD_QUICK_ACTIONS: DashboardQuickAction[] = [
  {
    id: "leave-approvals",
    title: "Leave requests",
    description: "Review and respond to pending approvals.",
    route: "/(app)/leave",
    accessibilityHint: "Opens pending leave approvals",
  },
  {
    id: "notifications",
    title: "Notifications",
    description: "View alerts and updates.",
    route: "/(app)/(tabs)/notifications",
    accessibilityHint: "Opens the Notifications tab",
  },
  {
    id: "history",
    title: "Approval history",
    description: "Review past leave decisions.",
    route: "/(app)/(tabs)/history",
    accessibilityHint: "Opens the Approval History tab",
  },
  {
    id: "security",
    title: "Security Center",
    description: "Manage trusted devices and biometrics.",
    route: "/(app)/security",
    accessibilityHint: "Opens the Security Center",
  },
  {
    id: "help",
    title: "Help & support",
    description: "Get answers and contact support.",
    route: "/(app)/help",
    accessibilityHint: "Opens Help & Support",
  },
];
