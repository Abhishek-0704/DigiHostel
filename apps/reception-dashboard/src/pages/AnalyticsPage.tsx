import { useMemo, useState } from "react";
import { ContentLayout } from "../layouts/ContentLayout";
import { getBreadcrumbTrail } from "../lib/navigation/navigationConfig";
import { useAuthorization } from "../contexts/AuthorizationContext";
import { useToast } from "../components/ui";
import { Button } from "../components/ui";
import {
  useAnalyticsOverview,
  useLeaveTrend,
  useMovementTrend,
  buildDateRange,
  formatMinutes,
  formatPercent,
  DEFAULT_DATE_RANGE_PRESET,
  type DateRangePresetId,
} from "../features/analytics";
import {
  KPISection,
  DateRangeFilter,
  LeaveTrendChart,
  MovementTrendChart,
} from "../components/analytics";
import styles from "./AnalyticsPage.module.css";

/**
 * Operational Intelligence & Executive Analytics Dashboard (Phase 6,
 * Prompt 15), replacing Prompt 0.2's "Future scope" placeholder. Reuses
 * the existing `reports:view` permission gate (`routes/index.tsx`,
 * unchanged) — this page is only ever mounted for `hostel_admin`/
 * `super_admin`, matching the backend's own `requireStaffRole("hostel_admin",
 * "super_admin")` boundary on every `/analytics/*` route.
 *
 * A pure READ-MODEL presentation layer: every number here is a fresh
 * server-derived aggregate over the caller's own authorized hostel scope
 * (`apps/api/src/domain/analytics`) — this page performs no calculation of
 * its own beyond simple display formatting (`features/analytics/format.ts`).
 *
 * Deliberately NO realtime subscription — mirrors `AuditPage`'s own
 * established precedent and reasoning exactly: this page aggregates across
 * a whole selected date range, not a single row, so a `postgres_changes`
 * event has no safe, non-approximated way to update it incrementally
 * (recomputing the full dashboard on every leave/movement/notification
 * event across every connected staff session would be exactly the
 * "recompute everything on every event" anti-pattern Prompt 15 §19
 * explicitly warns against). "Refresh" is a manual, honest re-fetch of all
 * three endpoints — never a fabricated "Live" indicator.
 */
export default function AnalyticsPage() {
  const { role } = useAuthorization();
  const { showToast } = useToast();
  const [presetId, setPresetId] = useState<DateRangePresetId>(DEFAULT_DATE_RANGE_PRESET);

  const range = useMemo(() => buildDateRange(presetId), [presetId]);

  const overviewState = useAnalyticsOverview(range);
  const leaveTrendState = useLeaveTrend(range);
  const movementTrendState = useMovementTrend(range);

  async function handleRefresh() {
    await Promise.all([
      overviewState.refresh(),
      leaveTrendState.refresh(),
      movementTrendState.refresh(),
    ]);
    showToast({ variant: "success", message: "Analytics refreshed." });
  }

  const overview = overviewState.overview;

  return (
    <ContentLayout
      title="Operational Intelligence"
      description="Executive analytics over Leave, Movement, Presence, and Notification activity within your authorized scope."
      breadcrumb={getBreadcrumbTrail("analytics")}
      width="full"
      actions={
        <div className={styles.headerActions}>
          <span className={styles.scopeIndicator}>
            {role === "super_admin" ? "All hostels" : "Hostel-scoped"}
          </span>
          <Button variant="secondary" onClick={() => void handleRefresh()}>
            Refresh
          </Button>
        </div>
      }
    >
      <div className={styles.page}>
        <DateRangeFilter value={presetId} onChange={setPresetId} />

        {overviewState.error ? (
          <p role="alert" className={styles.errorBanner}>
            {overviewState.error.message}
          </p>
        ) : null}

        <KPISection
          title="Student Presence (right now)"
          tiles={[
            {
              label: "Total Students",
              value: overview ? overview.presence.totalStudents : null,
              loading: overviewState.isLoading,
            },
            {
              label: "Currently Inside",
              value: overview ? overview.presence.studentsInside : null,
              loading: overviewState.isLoading,
            },
            {
              label: "Currently Outside",
              value: overview ? overview.presence.studentsOutside : null,
              loading: overviewState.isLoading,
            },
          ]}
        />

        <KPISection
          title="Leave"
          tiles={[
            {
              label: "Pending Now",
              value: overview ? overview.leave.pendingNow : null,
              loading: overviewState.isLoading,
            },
            {
              label: "Created in Period",
              value: overview ? overview.leave.createdInPeriod : null,
              loading: overviewState.isLoading,
            },
            {
              label: "Approved in Period",
              value: overview ? overview.leave.approvedInPeriod : null,
              loading: overviewState.isLoading,
            },
            {
              label: "Rejected in Period",
              value: overview ? overview.leave.rejectedInPeriod : null,
              loading: overviewState.isLoading,
            },
            {
              label: "Expired in Period",
              value: overview ? overview.leave.expiredInPeriod : null,
              loading: overviewState.isLoading,
            },
            {
              label: "Approval Rate",
              value:
                overview && overview.leave.approvalRate !== null
                  ? formatPercent(overview.leave.approvalRate)
                  : null,
              unavailableReason: "No decided requests in this period",
              loading: overviewState.isLoading,
            },
            {
              label: "Avg. Parent Response Time",
              value:
                overview && overview.leave.avgResponseMinutes !== null
                  ? formatMinutes(overview.leave.avgResponseMinutes)
                  : null,
              unavailableReason: "No decisions with both timestamps in this period",
              loading: overviewState.isLoading,
            },
          ]}
        />

        <KPISection
          title="Movement"
          tiles={[
            {
              label: "Hostel Returns in Period",
              value: overview ? overview.movement.returnsInPeriod : null,
              loading: overviewState.isLoading,
            },
            {
              label: "Avg. Time Outside Hostel",
              value:
                overview && overview.movement.avgDurationMinutes !== null
                  ? formatMinutes(overview.movement.avgDurationMinutes)
                  : null,
              unavailableReason: "No completed returns in this period",
              loading: overviewState.isLoading,
            },
          ]}
        />

        <KPISection
          title="Parent/Student Notifications (Leave Escalation)"
          tiles={[
            {
              label: "Generated in Period",
              value: overview ? overview.notifications.generatedInPeriod : null,
              loading: overviewState.isLoading,
            },
            {
              label: "Delivered in Period",
              value: overview ? overview.notifications.deliveredInPeriod : null,
              loading: overviewState.isLoading,
            },
            {
              label: "Failed in Period",
              value: overview ? overview.notifications.failedInPeriod : null,
              loading: overviewState.isLoading,
            },
          ]}
        />

        <div className={styles.chartGrid}>
          <LeaveTrendChart
            trend={leaveTrendState.trend}
            isLoading={leaveTrendState.isLoading}
            error={leaveTrendState.error}
            onRetry={() => void leaveTrendState.refresh()}
          />
          <MovementTrendChart
            trend={movementTrendState.trend}
            isLoading={movementTrendState.isLoading}
            error={movementTrendState.error}
            onRetry={() => void movementTrendState.refresh()}
          />
        </div>

        <p className={styles.deferredNote}>
          Hostel occupancy (against room/bed capacity), Digital Library Pass activity, and
          administrative session-level analytics are not yet available — see the Analytics Dashboard
          documentation for why.
        </p>
      </div>
    </ContentLayout>
  );
}
