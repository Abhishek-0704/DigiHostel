import { Card, Skeleton } from "../ui";
import { configurationDomainLabel } from "./ConfigurationDomainLabel";
import type { ConfigurationStatistics, ConfigurationDomain } from "@digihostel/api-client-react";
import styles from "./ConfigurationStatisticsStrip.module.css";

export interface ConfigurationStatisticsStripProps {
  statistics: ConfigurationStatistics | null;
  loading?: boolean;
}

/**
 * Enterprise Configuration Center statistics strip (Phase 5, Prompt 14) —
 * every number is the real `GET /configuration/statistics` server-derived
 * aggregate, within the caller's own hostel scope (never a client-computed
 * count over only the current paginated page), mirroring
 * `StaffStatisticsStrip`'s reasoning.
 */
export function ConfigurationStatisticsStrip({
  statistics,
  loading,
}: ConfigurationStatisticsStripProps) {
  if (loading || !statistics) {
    return (
      <div className={styles.strip} aria-busy="true" aria-label="Loading configuration statistics">
        {[0, 1, 2].map((i) => (
          <Card key={i} className={styles.stat}>
            <Skeleton height={28} width="50%" />
            <Skeleton height={12} width="80%" />
          </Card>
        ))}
      </div>
    );
  }

  const domainEntries = (
    Object.entries(statistics.byDomain) as [ConfigurationDomain, number][]
  ).filter(([, count]) => count > 0);

  return (
    <div className={styles.strip}>
      <Card className={styles.stat}>
        <span className={styles.value}>{statistics.totalEntries}</span>
        <span className={styles.label}>Total Entries</span>
      </Card>
      <Card className={styles.stat}>
        <span className={styles.value}>{statistics.activeEntries}</span>
        <span className={styles.label}>Active</span>
      </Card>
      <Card className={styles.stat}>
        <span className={styles.value}>{statistics.inactiveEntries}</span>
        <span className={styles.label}>Inactive</span>
      </Card>
      {domainEntries.map(([domain, count]) => (
        <Card key={domain} className={styles.stat}>
          <span className={styles.value}>{count}</span>
          <span className={styles.label}>{configurationDomainLabel(domain)}</span>
        </Card>
      ))}
    </div>
  );
}
