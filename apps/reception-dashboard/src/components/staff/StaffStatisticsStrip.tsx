import { Card, Skeleton } from "../ui";
import { staffRoleLabel } from "./StaffRoleLabel";
import type { StaffStatistics, StaffAdminRole } from "@digihostel/api-client-react";
import styles from "./StaffStatisticsStrip.module.css";

export interface StaffStatisticsStripProps {
  statistics: StaffStatistics | null;
  loading?: boolean;
}

const ROLE_ORDER: StaffAdminRole[] = [
  "reception_warden",
  "hostel_admin",
  "library_incharge",
  "super_admin",
];

/**
 * Identity & Access Administration Center statistics strip (Phase 5,
 * Prompt 13) — every number is the real `GET /staff/statistics`
 * server-derived aggregate (never a client-computed count over only the
 * current paginated page), mirroring `AuditStatisticsStrip`'s reasoning.
 */
export function StaffStatisticsStrip({ statistics, loading }: StaffStatisticsStripProps) {
  if (loading || !statistics) {
    return (
      <div className={styles.strip} aria-busy="true" aria-label="Loading staff statistics">
        {[0, 1, 2].map((i) => (
          <Card key={i} className={styles.stat}>
            <Skeleton height={28} width="50%" />
            <Skeleton height={12} width="80%" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className={styles.strip}>
      <Card className={styles.stat}>
        <span className={styles.value}>{statistics.totalStaff}</span>
        <span className={styles.label}>Total Staff</span>
      </Card>
      <Card className={styles.stat}>
        <span className={styles.value}>{statistics.activeStaff}</span>
        <span className={styles.label}>Active</span>
      </Card>
      <Card className={styles.stat}>
        <span className={styles.value}>{statistics.suspendedStaff}</span>
        <span className={styles.label}>Suspended</span>
      </Card>
      {ROLE_ORDER.map((role) => (
        <Card key={role} className={styles.stat}>
          <span className={styles.value}>{statistics.byRole[role]}</span>
          <span className={styles.label}>{staffRoleLabel(role)}</span>
        </Card>
      ))}
    </div>
  );
}
