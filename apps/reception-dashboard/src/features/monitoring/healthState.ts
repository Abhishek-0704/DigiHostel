import type { StatusTone } from "../../components/ui";
import type { HealthState } from "../../services/monitoring/MonitoringService";

/** Platform Health Model presentation mapping (Prompt 18 §8/§28) — tone is
 * always paired with the state's own text label (via `StatusBadge`, never
 * color-only), so this mapping is a visual aid, not the only signal. */
export const HEALTH_STATE_TONE: Record<HealthState, StatusTone> = {
  healthy: "success",
  warning: "warning",
  degraded: "error",
  unavailable: "error",
  unknown: "neutral",
};

export const HEALTH_STATE_LABEL: Record<HealthState, string> = {
  healthy: "Healthy",
  warning: "Warning",
  degraded: "Degraded",
  unavailable: "Unavailable",
  unknown: "Unknown",
};
