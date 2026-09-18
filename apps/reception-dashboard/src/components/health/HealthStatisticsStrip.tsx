import { Card, Skeleton } from "../ui";
import type { HealthCaseStatistics } from "@digihostel/api-client-react";
import styles from "./HealthStatisticsStrip.module.css";

export interface HealthStatisticsStripProps {
  statistics: HealthCaseStatistics | null;
  loading?: boolean;
}

/**
 * Health Operations Center statistics strip (Phase 4, Prompt 11) — every
 * number is the real `GET /health-cases/statistics` server-derived
 * aggregate (never a client-computed count over only the current paginated
 * queue page). Mirrors `EmergencyStatisticsStrip`'s own reasoning for not
 * reusing `MetricCard`.
 */
export function HealthStatisticsStrip({ statistics, loading }: HealthStatisticsStripProps) {
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
    { label: "New", value: statistics.newCases },
    { label: "Monitoring", value: statistics.monitoring },
    { label: "Awaiting Update", value: statistics.awaitingUpdate },
    { label: "Admitted Today", value: statistics.admittedToday },
    { label: "Discharged Today", value: statistics.dischargedToday },
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
