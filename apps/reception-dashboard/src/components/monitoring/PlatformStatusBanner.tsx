import { StatusBadge } from "../ui";
import { HEALTH_STATE_TONE, HEALTH_STATE_LABEL } from "../../features/monitoring";
import type { HealthState } from "../../services/monitoring/MonitoringService";
import styles from "./PlatformStatusBanner.module.css";

export interface PlatformStatusBannerProps {
  status: HealthState;
  generatedAt: string;
}

/** Top-level aggregate (Prompt 18 §8) — the MAXIMUM severity across every
 * infrastructure signal, never a fabricated "all green" summary. See
 * `domain/monitoring/types.ts`'s `worstHealthState` for the exact
 * aggregation rule this mirrors. */
export function PlatformStatusBanner({ status, generatedAt }: PlatformStatusBannerProps) {
  return (
    <div className={styles.banner} role="status">
      <span className={styles.heading}>Platform Status</span>
      <StatusBadge label={HEALTH_STATE_LABEL[status]} tone={HEALTH_STATE_TONE[status]} />
      <span className={styles.timestamp}>As of {new Date(generatedAt).toLocaleTimeString()}</span>
    </div>
  );
}
