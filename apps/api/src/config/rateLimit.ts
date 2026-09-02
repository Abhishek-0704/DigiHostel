/**
 * Named, overridable rate-limiting configuration (Prompt 0.6 audit G-02).
 * SDD Ch.2/Ch.17.3 require rate limiting qualitatively ("DoS -> rate
 * limiting") without specifying numeric values — the tiers/defaults below
 * are this remediation task's own scoped choice (external best-practice,
 * not an SDD-mandated number), env-overridable rather than hard-coded,
 * matching this codebase's existing config/escalation.ts convention.
 */

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface RateLimitTier {
  max: number;
  /** Milliseconds. */
  timeWindow: number;
}

/** Applies to every route unless a route sets its own stricter tier below.
 * Generous enough not to interfere with normal mobile-app polling; strict
 * enough to blunt scripted/unauthenticated abuse. */
export const RATE_LIMIT_GLOBAL: RateLimitTier = {
  max: envNumber("RATE_LIMIT_GLOBAL_MAX", 300),
  timeWindow: envNumber("RATE_LIMIT_GLOBAL_WINDOW_MS", 60_000),
};

/** Leave-decision routes (approve/reject) — the most security-sensitive
 * endpoints in this API (biometric-gated; the gate is currently a
 * non-cryptographic placeholder per security-gates.ts, which makes
 * throttling repeated attempts against a stolen/valid bearer token more
 * important, not less). A legitimate parent decides a given request once;
 * this stays generous enough for a dropped-response retry while sharply
 * limiting brute-force attempts. */
export const RATE_LIMIT_DECISION: RateLimitTier = {
  max: envNumber("RATE_LIMIT_DECISION_MAX", 20),
  timeWindow: envNumber("RATE_LIMIT_DECISION_WINDOW_MS", 60_000),
};

/** Leave creation (student-only) — a student has no legitimate reason to
 * create many requests per minute. */
export const RATE_LIMIT_CREATE: RateLimitTier = {
  max: envNumber("RATE_LIMIT_CREATE_MAX", 30),
  timeWindow: envNumber("RATE_LIMIT_CREATE_WINDOW_MS", 60_000),
};

/** Staff expiry action (manual_verification -> expired) — staff-console
 * usage pattern, moderate. */
export const RATE_LIMIT_EXPIRE: RateLimitTier = {
  max: envNumber("RATE_LIMIT_EXPIRE_MAX", 30),
  timeWindow: envNumber("RATE_LIMIT_EXPIRE_WINDOW_MS", 60_000),
};
