import { ContentLayout } from "../layouts/ContentLayout";
import { getBreadcrumbTrail } from "../lib/navigation/navigationConfig";
import { Button, Card, Skeleton, ErrorState, StatusBadge, useToast } from "../components/ui";
import { useMonitoringOverview } from "../features/monitoring";
import { useRealtimeConnectionProbe } from "../hooks";
import {
  PlatformStatusBanner,
  HealthSignalRow,
  ApplicationModulesGrid,
  OperationalHealthPanel,
  SecurityHealthPanel,
  AlertsPanel,
  DiagnosticsPanel,
} from "../components/monitoring";
import styles from "./SystemPage.module.css";

const REALTIME_STATE_LABEL: Record<string, string> = {
  idle: "Connecting",
  subscribing: "Connecting",
  subscribed: "Connected",
  error: "Reconnecting",
  closed: "Disconnected",
};

/**
 * Enterprise Operations Monitoring Center (Phase 7, Prompt 18), replacing
 * the "Phase 7, Prompt 18." placeholder reserved for it since Prompt 0.2.
 * Reuses the existing `system:view` permission (super_admin-only,
 * `routes/index.tsx`'s `withPermission("system:view", ...)`, unchanged) —
 * this page is only ever mounted for a super_admin session, matching the
 * backend's own `requireStaffRole("super_admin")` + AAL2 boundary on every
 * `/monitoring/*` route.
 *
 * Deliberately NO auto-refresh and NO realtime subscription for the
 * aggregate overview (see `features/monitoring/useMonitoringOverview.ts`'s
 * doc comment) — a manual "Refresh" re-fetches every signal fresh,
 * including a real Supabase Auth Admin API round-trip, mirroring
 * `AnalyticsPage`/`AuditPage`'s own established precedent. The one
 * genuinely live signal on this page is "Realtime Connection (this
 * session)", which reuses the EXISTING `useRealtimeConnectionProbe` hook
 * (Prompt 5) rather than a second implementation — it observes this
 * browser's own socket, a different (and complementary) fact from the
 * backend's server-side `realtime-publication` check shown in
 * Infrastructure Health below.
 */
export default function SystemPage() {
  const { showToast } = useToast();
  const { overview, isLoading, isFetching, error, refresh } = useMonitoringOverview();
  const realtimeState = useRealtimeConnectionProbe();

  async function handleRefresh() {
    await refresh();
    showToast({ variant: "success", message: "Monitoring data refreshed." });
  }

  return (
    <ContentLayout
      title="Enterprise Operations Monitoring"
      description="Real-time operational, infrastructure, and security health for the DigiHostel platform."
      breadcrumb={getBreadcrumbTrail("system")}
      width="full"
      actions={
        <Button variant="secondary" onClick={() => void handleRefresh()} loading={isFetching}>
          Refresh
        </Button>
      }
    >
      <div className={styles.page}>
        {error ? (
          <ErrorState message={error.message} onRetry={() => void refresh()} />
        ) : isLoading || !overview ? (
          <Card>
            <Skeleton height={80} />
          </Card>
        ) : (
          <>
            <Card>
              <PlatformStatusBanner
                status={overview.platformStatus}
                generatedAt={overview.generatedAt}
              />
            </Card>

            <div className={styles.grid}>
              <Card>
                <h2 className={styles.heading}>Infrastructure Health</h2>
                <ul className={styles.signalList}>
                  {overview.infrastructure.map((s) => (
                    <HealthSignalRow key={s.id} signal={s} />
                  ))}
                </ul>
              </Card>

              <Card>
                <h2 className={styles.heading}>Realtime Status</h2>
                <div className={styles.realtimeRow}>
                  <span className={styles.label}>Realtime Connection (this session)</span>
                  <StatusBadge
                    label={REALTIME_STATE_LABEL[realtimeState] ?? "Unknown"}
                    tone={
                      realtimeState === "subscribed"
                        ? "success"
                        : realtimeState === "error"
                          ? "warning"
                          : realtimeState === "closed"
                            ? "error"
                            : "neutral"
                    }
                  />
                </div>
                <p className={styles.note}>
                  Observes this browser's own Supabase Realtime socket — distinct from the
                  server-side "Realtime Publication" check under Infrastructure Health above.
                </p>
              </Card>

              <OperationalHealthPanel operational={overview.operational} />
              <SecurityHealthPanel security={overview.security} />

              <Card>
                <h2 className={styles.heading}>Deployment</h2>
                <div className={styles.deploymentRow}>
                  <span>Version</span>
                  <span>{overview.deployment.version}</span>
                </div>
                <div className={styles.deploymentRow}>
                  <span>Environment</span>
                  <span>{overview.deployment.environment}</span>
                </div>
              </Card>
            </div>

            <AlertsPanel alerts={overview.alerts} />

            <Card>
              <h2 className={styles.heading}>Application Modules</h2>
              <ApplicationModulesGrid modules={overview.applicationModules} />
            </Card>

            <DiagnosticsPanel />

            <p className={styles.deferredNote}>
              Alert acknowledgement/persistence, diagnostic execution history, hostel occupancy
              against capacity, and Digital Library Pass operational status are not yet available —
              see the Monitoring Center documentation for why.
            </p>
          </>
        )}
      </div>
    </ContentLayout>
  );
}
