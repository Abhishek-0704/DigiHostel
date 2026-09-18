import { Card, Skeleton } from "../ui";
import { auditModuleLabel } from "./AuditModuleBadge";
import type { AuditStatistics, AuditModule } from "@digihostel/api-client-react";
import styles from "./AuditStatisticsStrip.module.css";

export interface AuditStatisticsStripProps {
  statistics: AuditStatistics | null;
  loading?: boolean;
}

/**
 * Enterprise Audit Center statistics strip (Phase 5, Prompt 12) — every
 * number is the real `GET /audit/statistics` server-derived aggregate
 * (never a client-computed count over only the current paginated page).
 * Mirrors `HealthStatisticsStrip`'s/`EmergencyStatisticsStrip`'s own
 * reasoning for not reusing `MetricCard`.
 */
export function AuditStatisticsStrip({ statistics, loading }: AuditStatisticsStripProps) {
  if (loading || !statistics) {
    return (
      <div className={styles.strip} aria-busy="true" aria-label="Loading statistics">
        {[0, 1, 2].map((i) => (
          <Card key={i} className={styles.stat}>
            <Skeleton height={28} width="50%" />
            <Skeleton height={12} width="80%" />
          </Card>
        ))}
      </div>
    );
  }

  const moduleEntries = (Object.entries(statistics.byModule) as [AuditModule, number][]).filter(
    ([, count]) => count > 0,
  );

  return (
    <div className={styles.strip}>
      <Card className={styles.stat}>
        <span className={styles.value}>{statistics.eventsToday}</span>
        <span className={styles.label}>Events Today</span>
      </Card>
      {moduleEntries.map(([module, count]) => (
        <Card key={module} className={styles.stat}>
          <span className={styles.value}>{count}</span>
          <span className={styles.label}>{auditModuleLabel(module)}</span>
        </Card>
      ))}
      {moduleEntries.length === 0 && (
        <Card className={styles.stat}>
          <span className={styles.value}>0</span>
          <span className={styles.label}>No events recorded today</span>
        </Card>
      )}
    </div>
  );
}
