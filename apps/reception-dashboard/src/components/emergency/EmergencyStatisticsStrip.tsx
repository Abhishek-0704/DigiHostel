import { Card, Skeleton } from "../ui";
import type { EmergencyStatistics } from "@digihostel/api-client-react";
import styles from "./EmergencyStatisticsStrip.module.css";

export interface EmergencyStatisticsStripProps {
  statistics: EmergencyStatistics | null;
  loading?: boolean;
}

/**
 * EOC statistics strip (Phase 4, Prompt 10) — every number is the real
 * `GET /emergencies/statistics` server-derived aggregate (never a
 * client-computed count over only the current paginated queue page, which
 * would be wrong the moment there is more than one page). No icon/route
 * machinery from `MetricCard` (Dashboard Home) is reused here — that
 * component's contract is built around a permanently-possible "— / Awaiting
 * integration" placeholder state, which doesn't apply to this always-real
 * data source; a small, purpose-built card avoids forcing an ill-fitting
 * abstraction onto genuinely real data.
 */
export function EmergencyStatisticsStrip({ statistics, loading }: EmergencyStatisticsStripProps) {
  if (loading || !statistics) {
    return (
      <div className={styles.strip} aria-busy="true" aria-label="Loading statistics">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className={styles.stat}>
            <Skeleton height={28} width="50%" />
            <Skeleton height={12} width="80%" />
          </Card>
        ))}
      </div>
    );
  }

  const entries: { label: string; value: number; critical?: boolean }[] = [
    { label: "Active", value: statistics.active },
    { label: "Critical", value: statistics.critical, critical: true },
    { label: "New", value: statistics.open },
    { label: "Acknowledged", value: statistics.acknowledged },
    { label: "In Progress", value: statistics.inProgress },
    { label: "Resolved Today", value: statistics.resolvedToday },
  ];

  return (
    <div className={styles.strip}>
      {entries.map((entry) => (
        <Card key={entry.label} className={styles.stat}>
          <span className={[styles.value, entry.critical ? styles.criticalValue : ""].join(" ")}>
            {entry.value}
          </span>
          <span className={styles.label}>{entry.label}</span>
        </Card>
      ))}
    </div>
  );
}
