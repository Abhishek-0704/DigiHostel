import { Button, useToast } from "../ui";
import { RefreshIcon } from "../icons";
import styles from "./DashboardRefreshControl.module.css";

export interface DashboardRefreshControlProps {
  onRefresh: () => void;
}

/**
 * Manual dashboard refresh control (Prompt 5 §18). Delegates entirely to
 * `useDashboardRefresh`'s real invalidation/reconnect effects (see that
 * hook's doc comment for exactly what "refresh" does today) — this
 * component owns no fetch logic of its own. A toast confirms the action
 * happened, rather than a fabricated loading spinner with nothing to wait
 * on (§18/§34).
 */
export function DashboardRefreshControl({ onRefresh }: DashboardRefreshControlProps) {
  const { showToast } = useToast();

  function handleClick() {
    onRefresh();
    showToast({ message: "Dashboard refreshed.", variant: "info" });
  }

  return (
    <Button variant="secondary" className={styles.button} onClick={handleClick}>
      <RefreshIcon size="sm" />
      Refresh
    </Button>
  );
}
