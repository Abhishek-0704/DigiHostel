import { StatusBadge } from "../ui";
import { HEALTH_STATE_TONE, HEALTH_STATE_LABEL } from "../../features/monitoring";
import type { ApplicationModuleStatus } from "../../services/monitoring/MonitoringService";
import styles from "./ApplicationModulesGrid.module.css";

export interface ApplicationModulesGridProps {
  modules: ApplicationModuleStatus[];
}

/** Application Health (Prompt 18 §9). Every module here is a route-group of
 * this SAME `apps/api` process, not an independently-measured
 * microservice — deliberately never presented as one. Each tile's own
 * `detail` names the strongest truthful signal available, per §9's
 * explicit instruction. */
export function ApplicationModulesGrid({ modules }: ApplicationModulesGridProps) {
  return (
    <ul className={styles.grid}>
      {modules.map((m) => (
        <li key={m.id} className={styles.tile}>
          <span className={styles.label}>{m.label}</span>
          <StatusBadge label={HEALTH_STATE_LABEL[m.state]} tone={HEALTH_STATE_TONE[m.state]} />
          <span className={styles.detail}>{m.detail}</span>
        </li>
      ))}
    </ul>
  );
}
