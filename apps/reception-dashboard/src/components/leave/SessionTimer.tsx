import { useCurrentDateTime } from "../../hooks";
import {
  computeSessionTimer,
  formatSessionDuration,
  isTerminalLeaveStatus,
} from "../../features/leave";
import type { LeaveRequestStatus } from "@digihostel/api-client-react";
import styles from "./SessionTimer.module.css";

export interface SessionTimerProps {
  updatedAt: string;
  status: LeaveRequestStatus;
}

/**
 * Parent Approval Session timer (Phase 3, Prompt 7B §19/§21). Ticks once per
 * second via `useCurrentDateTime(1000)` — a deliberately finer interval than
 * the dashboard header clock's default 60s, justified here specifically
 * because a live countdown is this component's entire purpose (unlike
 * `WaitingTimeIndicator`'s coarse queue-table display). This is the ONLY
 * component in this app that requests a sub-minute tick, so it stays an
 * isolated, well-justified exception rather than a new global convention.
 *
 * "Elapsed" is real (derived from the real `updatedAt` server timestamp).
 * "Estimated next check" is explicitly labeled as an estimate — see
 * `features/leave/sessionTimer.ts`'s own doc comment for why this can never
 * be authoritative from the frontend.
 */
export function SessionTimer({ updatedAt, status }: SessionTimerProps) {
  const now = useCurrentDateTime(1000);
  // Reception-Initiated Parent Approval correction: "pending" now means "not
  // yet sent for parent approval by Reception" — no escalation job is
  // scheduled for it (LeaveRepository.create() no longer enqueues one), so
  // there is no "next automated check" to estimate, exactly like a terminal
  // status. computeSessionTimer's own `isTerminal` parameter is reused as-is
  // (its real meaning here is "suppress the estimate," which both cases
  // share) rather than adding a second, near-duplicate boolean.
  const noActiveEscalation = status === "pending" || isTerminalLeaveStatus(status);
  const reading = computeSessionTimer(updatedAt, now, noActiveEscalation);

  return (
    // Deliberately NOT an aria-live region — a per-second tick would be
    // read aloud continuously, which is accessibility noise, not help. The
    // one state change worth announcing (the approval result) is a
    // separate, dedicated live region — see SessionResultBanner.
    <div className={styles.wrapper}>
      <div className={styles.metric}>
        <span className={styles.label}>Time since last update</span>
        <span className={styles.value}>{formatSessionDuration(reading.elapsedMs)}</span>
      </div>
      {reading.estimatedNextCheckMs !== null && (
        <div className={styles.metric}>
          <span className={styles.label}>Next automated check (estimated)</span>
          <span className={styles.value}>
            {formatSessionDuration(reading.estimatedNextCheckMs)}
          </span>
          <span className={styles.estimateNote}>
            Estimate only — the server, not this display, decides the real timing.
          </span>
        </div>
      )}
    </div>
  );
}
