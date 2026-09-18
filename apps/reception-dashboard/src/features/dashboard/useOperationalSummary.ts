import { useMemo } from "react";
import { BellIcon } from "../../components/icons";
import { ROUTES } from "../../constants/routes";
import { useNotificationCenter } from "../../contexts/NotificationContext";
import { OPERATIONAL_SUMMARY_METRICS } from "./operationalSummary";
import type { MetricCardData } from "./types";

/**
 * View-model hook over the metric catalog (Prompt 5 §16, extended Prompt 6
 * §15 — "Only display data backed by the actual notification state. Do not
 * create a second notification data source for Dashboard Home."). Every
 * metric except Active Notifications is still the static
 * placeholder/future catalog from `operationalSummary.ts`; Active
 * Notifications is composed in here from the SAME canonical
 * `NotificationContext.unreadCount` the Header badge reads — never a
 * second, independently-computed count (Prompt 6 §40).
 */
export function useOperationalSummary(): { metrics: readonly MetricCardData[] } {
  const { unreadCount } = useNotificationCenter();

  const metrics = useMemo<readonly MetricCardData[]>(
    () => [
      ...OPERATIONAL_SUMMARY_METRICS,
      {
        id: "active-notifications",
        label: "Active Notifications",
        value: unreadCount,
        availability: "real",
        tone: "neutral",
        icon: BellIcon,
        route: ROUTES.notifications,
        requiredPermission: "notifications:view",
      },
    ],
    [unreadCount],
  );

  return { metrics };
}
