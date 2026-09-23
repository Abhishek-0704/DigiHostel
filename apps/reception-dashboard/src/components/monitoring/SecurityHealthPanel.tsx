import { Card } from "../ui";
import type { MonitoringOverview } from "../../services/monitoring/MonitoringService";
import styles from "./MetricList.module.css";

export interface SecurityHealthPanelProps {
  security: MonitoringOverview["security"];
}

/** Security Health (Prompt 18 §13) — high-level operational indicators
 * only, sourced from the existing `audit_logs`/`staff` tables. Never
 * exposes which specific account failed MFA, session tokens, or any
 * investigative detail — only aggregate counts, matching this module's own
 * §13/§34 data-minimization requirement. */
export function SecurityHealthPanel({ security }: SecurityHealthPanelProps) {
  return (
    <Card>
      <h2 className={styles.heading}>Security Health</h2>
      <dl className={styles.list}>
        <div className={styles.row}>
          <dt>Failed MFA Attempts (24h)</dt>
          <dd>{security.recentMfaFailures24h}</dd>
        </div>
        <div className={styles.row}>
          <dt>Suspended Staff Accounts</dt>
          <dd>{security.suspendedStaffAccounts}</dd>
        </div>
        <div className={styles.row}>
          <dt>Administrative Account Changes (24h)</dt>
          <dd>{security.recentAdministrativeChanges24h}</dd>
        </div>
      </dl>
    </Card>
  );
}
