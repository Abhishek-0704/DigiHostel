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

/** F-02 remediation (PRR Phase 13) — the OTP-request endpoint triggers a
 * real SMS send for an eligible roll number/relationship, so this is the
 * single most cost-sensitive route in the API; deliberately the strictest
 * tier here, independent of and in addition to Supabase's own
 * `max_frequency` floor (which this backend cannot see or rely on being
 * configured any particular way in a given deployment). A legitimate
 * parent needs at most a handful of attempts per minute (typo correction,
 * one resend). */
export const RATE_LIMIT_OTP_REQUEST: RateLimitTier = {
  max: envNumber("RATE_LIMIT_OTP_REQUEST_MAX", 5),
  timeWindow: envNumber("RATE_LIMIT_OTP_REQUEST_WINDOW_MS", 60_000),
};

/** OTP verification — a code-guessing target. `OtpChallengeStore`'s own
 * per-challenge attempt cap (5) is the primary defense; this IP-level tier
 * is a second, independent layer bounding how many *different* challenges a
 * single caller can hammer per minute. */
export const RATE_LIMIT_OTP_VERIFY: RateLimitTier = {
  max: envNumber("RATE_LIMIT_OTP_VERIFY_MAX", 10),
  timeWindow: envNumber("RATE_LIMIT_OTP_VERIFY_WINDOW_MS", 60_000),
};

/** ADR-003 implementation — device-registration challenge issuance. A
 * legitimate parent registers a handful of real devices, ever; generous
 * enough for retry-after-a-dropped-response, strict enough that a compromised
 * bearer token can't be used to mint an unbounded number of live nonces. */
export const RATE_LIMIT_DEVICE_CHALLENGE: RateLimitTier = {
  max: envNumber("RATE_LIMIT_DEVICE_CHALLENGE_MAX", 10),
  timeWindow: envNumber("RATE_LIMIT_DEVICE_CHALLENGE_WINDOW_MS", 60_000),
};

/** Reception Dashboard Prompt 1 — staff authentication audit-event
 * reporting. A legitimate staff member reports at most a handful of these
 * per session (one sign-in, maybe one MFA retry, one sign-out); generous
 * enough for that, strict enough that a stolen bearer token can't be used
 * to flood the audit trail. */
export const RATE_LIMIT_STAFF_AUTH_AUDIT: RateLimitTier = {
  max: envNumber("RATE_LIMIT_STAFF_AUTH_AUDIT_MAX", 20),
  timeWindow: envNumber("RATE_LIMIT_STAFF_AUTH_AUDIT_WINDOW_MS", 60_000),
};

/** Reception-Initiated Parent Approval correction — staff-console usage
 * pattern, matching RATE_LIMIT_EXPIRE's own reasoning: a Reception Warden
 * has no legitimate reason to call this many times per minute for the same
 * or different requests. */
export const RATE_LIMIT_START_PARENT_APPROVAL: RateLimitTier = {
  max: envNumber("RATE_LIMIT_START_PARENT_APPROVAL_MAX", 30),
  timeWindow: envNumber("RATE_LIMIT_START_PARENT_APPROVAL_WINDOW_MS", 60_000),
};

/** Reception Dashboard Prompt 7A — the staff operational leave-request
 * queue. A staff console legitimately polls/refreshes this more often than
 * a mobile app's own occasional list fetch (manual refresh, realtime
 * reconnect catch-up), so this is more generous than RATE_LIMIT_EXPIRE, but
 * still bounded well below the global default. */
export const RATE_LIMIT_STAFF_QUEUE: RateLimitTier = {
  max: envNumber("RATE_LIMIT_STAFF_QUEUE_MAX", 60),
  timeWindow: envNumber("RATE_LIMIT_STAFF_QUEUE_WINDOW_MS", 60_000),
};

/** Phase 3, Prompt 7C — Exit Authorization. Same reasoning as
 * RATE_LIMIT_EXPIRE/RATE_LIMIT_START_PARENT_APPROVAL: a staff-console action
 * a Reception Warden has no legitimate reason to call many times per minute
 * for the same or different requests. */
export const RATE_LIMIT_EXIT_AUTHORIZATION: RateLimitTier = {
  max: envNumber("RATE_LIMIT_EXIT_AUTHORIZATION_MAX", 30),
  timeWindow: envNumber("RATE_LIMIT_EXIT_AUTHORIZATION_WINDOW_MS", 60_000),
};

/** ADR-003 implementation — device-registration/attestation submission. Each
 * real Google Play Integrity verification is a billable, rate-limited call on
 * Google's own side too; this tier is the first line of defense against a
 * stolen bearer token being used to hammer that call. */
export const RATE_LIMIT_DEVICE_REGISTER: RateLimitTier = {
  max: envNumber("RATE_LIMIT_DEVICE_REGISTER_MAX", 10),
  timeWindow: envNumber("RATE_LIMIT_DEVICE_REGISTER_WINDOW_MS", 60_000),
};

/** Phase 5, Prompt 13 — Identity & Access Administration Center mutations
 * (create/role/hostel/status/reset-password/force-sign-out). The single
 * most sensitive mutation surface in this API — every one of these routes
 * is `requireSuperAdmin()`-gated and several involve the Supabase Auth
 * Admin API. A legitimate super_admin has no reason to perform many of
 * these per minute; matches RATE_LIMIT_OTP_REQUEST's "deliberately the
 * strictest tier" reasoning for the same class of concern (a stolen bearer
 * token being used to hammer a costly/sensitive external-API-backed
 * action), not RATE_LIMIT_STAFF_QUEUE's more generous console-polling
 * reasoning. */
export const RATE_LIMIT_STAFF_ADMIN: RateLimitTier = {
  max: envNumber("RATE_LIMIT_STAFF_ADMIN_MAX", 10),
  timeWindow: envNumber("RATE_LIMIT_STAFF_ADMIN_WINDOW_MS", 60_000),
};

/** Phase 5, Prompt 14 — Enterprise Configuration Center mutations
 * (create/update). Purely DB-only staff-console actions with no external
 * Admin API call — matches RATE_LIMIT_STAFF_QUEUE's/RATE_LIMIT_EXPIRE's
 * "staff-console usage pattern, moderate" reasoning rather than
 * RATE_LIMIT_STAFF_ADMIN's "costly/sensitive external-API-backed action"
 * reasoning (there is no external call here to protect). Still meaningfully
 * stricter than read traffic, since these are the mutations that can affect
 * other staff sessions/other hostels' visible configuration. */
export const RATE_LIMIT_CONFIGURATION_ADMIN: RateLimitTier = {
  max: envNumber("RATE_LIMIT_CONFIGURATION_ADMIN_MAX", 30),
  timeWindow: envNumber("RATE_LIMIT_CONFIGURATION_ADMIN_WINDOW_MS", 60_000),
};

/** Phase 7, Prompt 17 — Administrative Profile & Personal Preferences
 * Center. A self-service settings page: reads on every page nav plus
 * occasional saves, by every staff member (not just two privileged roles),
 * so this is deliberately more generous than `configurationAdmin` — no
 * cross-user or cross-hostel effect is possible from this route family at
 * all (every operation is confined to the caller's own row). */
export const RATE_LIMIT_PROFILE: RateLimitTier = {
  max: envNumber("RATE_LIMIT_PROFILE_MAX", 60),
  timeWindow: envNumber("RATE_LIMIT_PROFILE_WINDOW_MS", 60_000),
};
