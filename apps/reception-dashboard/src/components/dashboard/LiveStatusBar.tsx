import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import type { RealtimeConnectionState } from "../../hooks/useRealtimeChannel";
import { WifiIcon, WifiOffIcon } from "../icons";
import styles from "./LiveStatusBar.module.css";

const REALTIME_LABEL: Record<RealtimeConnectionState, string> = {
  idle: "Connecting",
  subscribing: "Connecting",
  subscribed: "Live",
  error: "Reconnecting",
  closed: "Disconnected",
};

export interface LiveStatusBarProps {
  realtimeState: RealtimeConnectionState;
  lastUpdatedAt: Date | null;
}

/**
 * Compact Live Status Bar (Prompt 5 §14). Reuses the SAME connectivity
 * signal (`useOnlineStatus`) `ConnectivityStatus` already shows in the
 * header — no second independent connectivity monitor (§14's explicit
 * rule) — plus the same realtime-socket probe `SystemHealthPanel` reads
 * (`realtimeState` is obtained ONCE at the page level and passed to both,
 * per §30's "avoid duplicate queries"). Only these two genuinely-observable
 * facts, plus a real "last updated" timestamp from the dashboard's own
 * refresh control, are shown; every other potential indicator this
 * section's own list names (pending approvals, critical alerts, online
 * staff count) has no working data source today (see
 * `operationalSummary.ts`/`useSystemHealth.ts`'s doc comments) and is
 * deliberately omitted rather than shown as a fabricated placeholder in an
 * already-compact bar.
 */
export function LiveStatusBar({ realtimeState, lastUpdatedAt }: LiveStatusBarProps) {
  const online = useOnlineStatus();

  return (
    <div className={styles.bar} role="status">
      <span className={styles.item}>
        {online ? <WifiIcon size="sm" /> : <WifiOffIcon size="sm" />}
        {online ? "Online" : "Offline"}
      </span>
      <span className={styles.item}>{REALTIME_LABEL[realtimeState] ?? "Unknown"}</span>
      {lastUpdatedAt && (
        <span className={styles.item}>Last updated {lastUpdatedAt.toLocaleTimeString()}</span>
      )}
    </div>
  );
}
