import { Card, EmptyState } from "../ui";
import type { MonitoringAlert } from "../../services/monitoring/MonitoringService";
import styles from "./AlertsPanel.module.css";

export interface AlertsPanelProps {
  alerts: MonitoringAlert[];
}

const SEVERITY_LABEL: Record<MonitoringAlert["severity"], string> = {
  informational: "Informational",
  warning: "Warning",
  critical: "Critical",
};

/** Alert Management (Prompt 18 §18) — derived live from this same request's
 * health signals, not persisted. Every alert names its `source` and a
 * concrete `detail`, so an operator always knows which real condition
 * produced it and where to go to investigate — never an opaque "something
 * is wrong." Acknowledgement/lifecycle persistence is explicitly deferred
 * (see `domain/monitoring/service.ts`'s `deriveAlerts` doc comment). */
export function AlertsPanel({ alerts }: AlertsPanelProps) {
  return (
    <Card>
      <h2 className={styles.heading}>System Alerts</h2>
      {alerts.length === 0 ? (
        <EmptyState
          title="No active alerts"
          description="Every monitored signal is within range."
        />
      ) : (
        <ul className={styles.list}>
          {alerts.map((alert) => (
            <li key={alert.id} className={[styles.item, styles[alert.severity]].join(" ")}>
              <span className={styles.severity}>{SEVERITY_LABEL[alert.severity]}</span>
              <span className={styles.title}>{alert.title}</span>
              <span className={styles.detail}>{alert.detail}</span>
              <span className={styles.source}>Source: {alert.source}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
