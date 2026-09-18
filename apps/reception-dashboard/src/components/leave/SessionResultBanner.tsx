import { LEAVE_STATUS_LABEL, isTerminalLeaveStatus } from "../../features/leave";
import type { LeaveRequestStatus } from "@digihostel/api-client-react";
import styles from "./SessionResultBanner.module.css";

export interface SessionResultBannerProps {
  status: LeaveRequestStatus;
}

const TONE_CLASS: Partial<Record<LeaveRequestStatus, string>> = {
  approved: styles.success,
  rejected: styles.error,
  expired: styles.warning,
};

const ICON: Partial<Record<LeaveRequestStatus, string>> = {
  approved: "✓",
  rejected: "✕",
  expired: "▲",
};

/**
 * Terminal-state result banner (Prompt 7B §21/§35). This is the ONE piece
 * of the Session Workspace that must be an accessible live region — §35's
 * explicit requirement: "when parent approval arrives, ensure the result is
 * announced accessibly without relying only on animation." `role="status"`
 * + `aria-live="polite"` announces the result the moment this component
 * mounts (i.e. the moment a realtime-triggered refetch reveals a terminal
 * status) — never color-only (icon + text together, matching `StatusBadge`'s
 * established non-color-only discipline).
 *
 * Renders nothing for a non-terminal status — the timer/progress indicator
 * already communicate "still in progress," and an empty/absent banner is
 * correct for that state, not a missing one.
 */
export function SessionResultBanner({ status }: SessionResultBannerProps) {
  if (!isTerminalLeaveStatus(status)) return null;
  const toneClass = TONE_CLASS[status];
  const icon = ICON[status];
  if (!toneClass || !icon) return null;

  return (
    <div className={[styles.banner, toneClass].join(" ")} role="status" aria-live="polite">
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
      <span>Session {LEAVE_STATUS_LABEL[status].toLowerCase()}</span>
    </div>
  );
}
