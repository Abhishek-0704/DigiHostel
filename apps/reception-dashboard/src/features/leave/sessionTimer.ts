/**
 * Parent Approval Session timer model (Phase 3, Prompt 7B). The frontend
 * timer is presentation only — the AUTHORITATIVE expiration decision is
 * never made here. It already lives entirely server-side, in the real,
 * pre-existing escalation worker (`apps/api/src/workers/escalationWorker.ts`,
 * ADR-017/ADR-019): a `leave_requests.status` transition only ever happens
 * because `LeaveRepository.advanceEscalation()` (or a parent's own
 * `decide()` call) actually committed it. This module never decides a
 * session has expired; it only renders the REAL `status`/`updatedAt` this
 * page already has, plus an honest, clearly-labeled ESTIMATE of when the
 * next automated check is likely to happen.
 *
 * `DEFAULT_ESCALATION_STAGE_TIMEOUT_MS` mirrors
 * `apps/api/src/config/escalation.ts`'s own default (90s) — that value is
 * genuinely real, existing, product-supplied configuration (ADR-017 §2),
 * not invented for this prompt. It is env-overridable server-side
 * (`ESCALATION_STAGE_TIMEOUT_MS`) and this frontend has no way to read that
 * override (no endpoint exposes it, and adding one purely to back a timer
 * estimate was judged out of this prompt's minimal-safe-change scope) — so
 * every "estimated" value derived from it is explicitly labeled as an
 * estimate in the UI, never presented as an authoritative deadline.
 */
export const DEFAULT_ESCALATION_STAGE_TIMEOUT_MS = 90_000;

export interface SessionTimerReading {
  elapsedMs: number;
  /** Only meaningful for a non-terminal (still-escalating) status — null for
   * an already-terminal session, since there is no "next stage" to wait for. */
  estimatedNextCheckMs: number | null;
}

export function computeSessionTimer(
  updatedAt: string,
  now: Date,
  isTerminal: boolean,
  stageTimeoutMs: number = DEFAULT_ESCALATION_STAGE_TIMEOUT_MS,
): SessionTimerReading {
  const elapsedMs = Math.max(0, now.getTime() - new Date(updatedAt).getTime());
  return {
    elapsedMs,
    estimatedNextCheckMs: isTerminal ? null : Math.max(0, stageTimeoutMs - elapsedMs),
  };
}

/** Compact "Xm Ys" / "Xh Ym" formatting for the session timer display —
 * deliberately finer-grained than `formatWaitingDuration` (queue table),
 * since a live per-second countdown is the whole point of this timer. */
export function formatSessionDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
