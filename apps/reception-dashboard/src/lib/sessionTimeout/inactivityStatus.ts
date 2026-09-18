import type { SessionTimeoutConfig } from "./config";

export type InactivityStatus = "active" | "warning" | "expired";

/** Pure derivation (Prompt 1 §16), kept separate from the DOM/timer-owning
 * hook (`hooks/useInactivityTimer.ts`) so it's unit-testable without jsdom —
 * mirrors `contexts/authStatus.ts`'s own separation-of-concerns pattern. */
export function deriveInactivityStatus(
  idleMs: number,
  config: SessionTimeoutConfig,
): InactivityStatus {
  if (idleMs >= config.idleTimeoutMs) return "expired";
  if (idleMs >= config.idleTimeoutMs - config.warningBeforeMs) return "warning";
  return "active";
}
