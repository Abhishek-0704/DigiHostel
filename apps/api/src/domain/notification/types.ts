import type { DecidableStatus } from "../leave/types.js";

/**
 * The three provider-outcome cases ADR-018 §5 requires be explicitly
 * distinguished. `unknown` and `rejected`-that-still-has-retries both feed
 * the same retry path — only `accepted` and retries-exhausted are terminal.
 */
export type PushSendResult =
  { outcome: "accepted" } | { outcome: "rejected"; reason: string } | { outcome: "unknown" };

/** Port over the Expo Push provider (ADR-010) — kept separate from the SDK
 * so tests can use an in-memory fake instead of a real network call, mirroring
 * this codebase's BiometricFreshnessGate port pattern. `tokens` may be
 * multiple devices for the same recipient; fan-out across them is this
 * method's own concern (ADR-018 §7 — one delivery attempt, successful if the
 * provider accepts for at least one). */
export interface PushSender {
  send(tokens: string[], title: string, body: string): Promise<PushSendResult>;
}

export interface RecipientTarget {
  recipientId: string;
  pushTokens: string[];
}

export type NotificationRowStatus = "queued" | "sent" | "delivered" | "failed";

export interface NotificationRow {
  id: string;
  recipientId: string;
  stage: DecidableStatus;
  status: NotificationRowStatus;
  retryCount: number;
}
