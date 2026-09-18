/**
 * Administrative session-timeout configuration (Prompt 1 §16). SDD Ch.17
 * names "Session Timeout — Reduce exposure from unattended devices"
 * qualitatively (confirmed by direct extraction of
 * sdd/Chapter_17_Security_Architecture_Foundation_SDD.docx this prompt) —
 * exactly like `apps/api/src/config/rateLimit.ts`'s own precedent ("SDD...
 * require[s] rate limiting qualitatively... without specifying numeric
 * values — the tiers/defaults below are this... task's own scoped choice").
 * The numbers below are that same kind of scoped choice, not an SDD-mandated
 * number: **INFERRED**, not VERIFIED. Env-overridable so a real product
 * decision can change them without a code change, mirroring
 * `envNumber()`'s exact backend convention.
 */

function envMinutes(name: keyof ImportMetaEnv, fallbackMinutes: number): number {
  const raw = import.meta.env[name];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed * 60_000 : fallbackMinutes * 60_000;
}

export interface SessionTimeoutConfig {
  /** Total idle time before the session is force-signed-out. */
  idleTimeoutMs: number;
  /** How long before expiry the "warning" state begins — this is the
   * window Prompt 2's UI should use to show a "you're about to be signed
   * out" prompt and a chance to stay signed in. */
  warningBeforeMs: number;
}

export const SESSION_TIMEOUT_CONFIG: SessionTimeoutConfig = {
  idleTimeoutMs: envMinutes("VITE_SESSION_IDLE_TIMEOUT_MINUTES", 15),
  warningBeforeMs: envMinutes("VITE_SESSION_IDLE_WARNING_MINUTES", 2),
};
