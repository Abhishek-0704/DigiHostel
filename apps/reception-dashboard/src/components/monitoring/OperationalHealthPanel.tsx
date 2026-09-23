import { Card } from "../ui";
import type { MonitoringOverview } from "../../services/monitoring/MonitoringService";
import styles from "./MetricList.module.css";

export interface OperationalHealthPanelProps {
  operational: MonitoringOverview["operational"];
}

/** Operational Health (Prompt 18 §12) — every figure here is a read-only
 * reuse of an already-certified domain service (Analytics/Emergency/
 * Health), never a duplicated calculation. `notificationsFailedLast24h`
 * renders "Not available" rather than "0" when the underlying analytics
 * aggregate itself could not be computed (`null`, never a fabricated
 * zero). */
export function OperationalHealthPanel({ operational }: OperationalHealthPanelProps) {
  return (
    <Card>
      <h2 className={styles.heading}>Operational Health</h2>
      <dl className={styles.list}>
        <div className={styles.row}>
          <dt>Pending Leave Authorizations</dt>
          <dd>{operational.pendingLeaveAuthorizations}</dd>
        </div>
        <div className={styles.row}>
          <dt>Students Outside Hostel</dt>
          <dd>{operational.studentsOutsideHostel}</dd>
        </div>
        <div className={styles.row}>
          <dt>Active Emergencies</dt>
          <dd>
            {operational.activeEmergencies}
            {operational.criticalEmergencies > 0
              ? ` (${operational.criticalEmergencies} critical)`
              : ""}
          </dd>
        </div>
        <div className={styles.row}>
          <dt>Active Health Cases</dt>
          <dd>
            {operational.activeHealthCases}
            {operational.criticalHealthCases > 0
              ? ` (${operational.criticalHealthCases} critical)`
              : ""}
          </dd>
        </div>
        <div className={styles.row}>
          <dt>Notifications Failed (24h)</dt>
          <dd>
            {operational.notificationsFailedLast24h === null
              ? "Not available"
              : operational.notificationsFailedLast24h}
          </dd>
        </div>
        <div className={styles.row}>
          <dt>Library Operations</dt>
          <dd>Future — Digital Library Pass not yet implemented</dd>
        </div>
      </dl>
    </Card>
  );
}
