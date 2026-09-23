import { StatusBadge } from "../ui";
import { HEALTH_STATE_TONE, HEALTH_STATE_LABEL } from "../../features/monitoring";
import type { HealthSignal } from "../../services/monitoring/MonitoringService";
import styles from "./HealthSignalRow.module.css";

export interface HealthSignalRowProps {
  signal: HealthSignal;
}

/** Single infrastructure health row (Prompt 18 §10/§28) — status is always
 * paired with `StatusBadge` (icon + text, never color alone) plus the
 * signal's own honest `detail` string, so "Healthy" always names a
 * genuinely-measured fact, never an assumption. `latencyMs` is shown only
 * when the check actually measured one (never fabricated for an
 * `unavailable`/`unknown` signal). */
export function HealthSignalRow({ signal }: HealthSignalRowProps) {
  return (
    <li className={styles.row}>
      <span className={styles.label}>{signal.label}</span>
      <div className={styles.statusBlock}>
        <StatusBadge
          label={HEALTH_STATE_LABEL[signal.state]}
          tone={HEALTH_STATE_TONE[signal.state]}
        />
        <span className={styles.detail}>
          {signal.detail}
          {signal.latencyMs !== null ? ` (${signal.latencyMs}ms)` : ""}
        </span>
      </div>
    </li>
  );
}
