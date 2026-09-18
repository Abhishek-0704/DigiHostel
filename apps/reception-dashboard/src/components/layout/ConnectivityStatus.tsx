import { WifiIcon, WifiOffIcon } from "../icons";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import styles from "./ConnectivityStatus.module.css";

/** Header status-area infrastructure (Prompt 4 §24/§25 — "connectivity
 * state... implement only infrastructure and currently available
 * information... do not invent realtime status information"). Uses the
 * browser's own real `navigator.onLine`/`online`/`offline` signal (Prompt 5
 * §14 extracted this into `useOnlineStatus` so `LiveStatusBar` can read the
 * exact same fact instead of standing up a second listener) — the one
 * connectivity fact actually available without inventing a sync/session
 * status this app has no mechanism to compute yet. `role="status"` so a
 * genuine transition is announced; the icon is decorative, the accessible
 * name carries the meaning (§27 — never color/icon alone). */
export function ConnectivityStatus() {
  const online = useOnlineStatus();

  return (
    <span
      className={styles.status}
      role="status"
      aria-label={online ? "Online" : "Offline — check your connection"}
      title={online ? "Online" : "Offline"}
    >
      {online ? <WifiIcon size="sm" /> : <WifiOffIcon size="sm" />}
    </span>
  );
}
