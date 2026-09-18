import { ContentLayout } from "../layouts/ContentLayout";
import { getBreadcrumbTrail } from "../lib/navigation/navigationConfig";
import {
  WelcomeSection,
  OperationalSummary,
  QuickActions,
  PendingWorkPanel,
  ActivityFeed,
  AnnouncementsPanel,
  SystemHealthPanel,
  LiveStatusBar,
  DashboardRefreshControl,
} from "../components/dashboard";
import { useDashboardRefresh } from "../features/dashboard";
import { useRealtimeConnectionProbe } from "../hooks/useRealtimeConnectionProbe";
import styles from "./DashboardHomePage.module.css";

/**
 * Dashboard Home — the operational command center displayed after login
 * (Phase 2, Prompt 5). Composes Prompt 4's shell (`ContentLayout`) with the
 * widgets in `components/dashboard/` and the view-model hooks in
 * `features/dashboard/` — this file owns layout/composition only, no
 * business logic of its own (§2/§38).
 *
 * `realtimeState` is read ONCE here, at the page level, via
 * `useRealtimeConnectionProbe`, and passed down to both `SystemHealthPanel`
 * and `LiveStatusBar` — a single shared realtime-socket probe, not two
 * independent subscriptions to the same non-business channel (§14/§30).
 * `useDashboardRefresh` similarly owns the one `generation`/`lastUpdatedAt`
 * pair this page's refresh control drives (§18).
 *
 * See `apps/reception-dashboard/docs/dashboard-home.md` for the full
 * architecture, the widget-by-widget REAL/PARTIAL/PLACEHOLDER/FUTURE data
 * classification, and the developer integration guide for future prompts.
 */
export default function DashboardHomePage() {
  const { generation, lastUpdatedAt, refresh } = useDashboardRefresh();
  const realtimeState = useRealtimeConnectionProbe(generation);

  return (
    <ContentLayout
      title="Dashboard"
      breadcrumb={getBreadcrumbTrail("dashboard")}
      width="full"
      actions={<DashboardRefreshControl onRefresh={refresh} />}
    >
      <div className={styles.page}>
        <WelcomeSection />
        <LiveStatusBar realtimeState={realtimeState} lastUpdatedAt={lastUpdatedAt} />
        <OperationalSummary />
        <QuickActions />
        <div className={styles.columns}>
          <div className={styles.mainColumn}>
            <PendingWorkPanel />
            <ActivityFeed />
          </div>
          <div className={styles.sideColumn}>
            <SystemHealthPanel realtimeState={realtimeState} />
            <AnnouncementsPanel />
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
