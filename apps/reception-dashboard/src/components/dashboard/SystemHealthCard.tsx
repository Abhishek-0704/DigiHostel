import { StatusBadge, type StatusTone } from "../ui";
import type { SystemHealthRow, SystemHealthStatus } from "../../features/dashboard";
import styles from "./SystemHealthCard.module.css";

const STATUS_LABEL: Record<SystemHealthStatus, string> = {
  operational: "Operational",
  degraded: "Degraded",
  unavailable: "Unavailable",
  unknown: "Unknown",
  not_configured: "Not configured",
};

const STATUS_TONE: Record<SystemHealthStatus, StatusTone> = {
  operational: "success",
  degraded: "warning",
  unavailable: "error",
  unknown: "neutral",
  not_configured: "neutral",
};

export interface SystemHealthCardProps {
  row: SystemHealthRow;
}

/** Single System Health row (Prompt 5 §13/§26). Status is always paired
 * with the existing `StatusBadge` (icon + text, never color alone — §8/§29)
 * plus a one-line `detail` naming exactly what was observed, so "green"
 * always means a genuinely observed signal, never an assumption (§13). */
export function SystemHealthCard({ row }: SystemHealthCardProps) {
  return (
    <li className={styles.row}>
      <span className={styles.label}>{row.label}</span>
      <div className={styles.statusBlock}>
        <StatusBadge label={STATUS_LABEL[row.status]} tone={STATUS_TONE[row.status]} />
        <span className={styles.detail}>{row.detail}</span>
      </div>
    </li>
  );
}
