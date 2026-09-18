import { Card } from "../ui";
import { useSystemHealth } from "../../features/dashboard";
import type { RealtimeConnectionState } from "../../hooks/useRealtimeChannel";
import { SystemHealthCard } from "./SystemHealthCard";
import styles from "./SystemHealthPanel.module.css";

export interface SystemHealthPanelProps {
  realtimeState: RealtimeConnectionState;
}

/**
 * System Health panel (Prompt 5 §13). A dashboard PRESENTATION layer only —
 * it does not implement the future System Health module (§13's explicit
 * scope boundary) and consumes only signals this app can genuinely observe
 * today (`useSystemHealth`'s doc comment has the full evidence per row).
 * `realtimeState` is read once at the page level and passed down (§30 —
 * shared with `LiveStatusBar`, not probed twice).
 */
export function SystemHealthPanel({ realtimeState }: SystemHealthPanelProps) {
  const { rows } = useSystemHealth(realtimeState);

  return (
    <Card className={styles.card}>
      <h2 className={styles.heading}>System Health</h2>
      <ul className={styles.list}>
        {rows.map((row) => (
          <SystemHealthCard key={row.id} row={row} />
        ))}
      </ul>
    </Card>
  );
}
