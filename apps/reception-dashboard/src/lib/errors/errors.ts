/**
 * Application error taxonomy (Prompt 0.2 foundation, extended Prompt 1 —
 * Authentication Infrastructure). Mirrors the backend's own typed-error /
 * safe-message discipline (apps/api/src/lib/errorHandler.ts — G-01) and
 * apps/parent-mobile/src/types/errors.ts's pattern: a small set of known
 * error kinds with pre-approved, safe, user-facing messages, plus a
 * catch-all for anything unexpected that must never surface raw detail to
 * the user.
 */

export type AppErrorKind =
  | "network"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation"
  | "realtime_unavailable"
  // Authentication/MFA kinds (§23 of Prompt 1's own error-taxonomy list).
  // Messages never leak which specific check failed beyond what's safe to
  // say (no account-existence hints, no factor/secret detail).
  | "invalid_credentials"
  /** Session could not be restored/refreshed — distinct from
   * "unauthenticated" (no session was ever presented) and from
   * "mfa_required" (an AuthStatus value, not an error — a valid session
   * exists, just not yet AAL2). Maps Supabase's own `session_expired`,
   * `session_not_found`, `refresh_token_not_found`,
   * `refresh_token_already_used` codes. */
  | "session_expired"
  /** STARTING/creating a new MFA challenge failed (e.g. no factor exists,
   * the factor-enroll limit was hit) — distinct from a submitted code being
   * wrong (`mfa_verification_failed`, below). */
  | "mfa_challenge_failed"
  /** A submitted TOTP code was wrong, or the challenge it was submitted
   * against had already expired — Supabase's `mfa_verification_failed`,
   * `mfa_verification_rejected`, and `mfa_challenge_expired` codes all map
   * here; the UI-relevant fact is the same in every case ("try again"), and
   * this backend never needs to distinguish further for the user. */
  | "mfa_verification_failed"
  | "mfa_enrollment_failed"
  /** Supabase Auth itself is unreachable, misconfigured, or rate-limiting
   * this client — distinct from a plain network failure (this is Supabase
   * responding, just not successfully) and from the app-wide `config_error`
   * AuthStatus (which means required env vars are missing entirely, a
   * structural state RequireAuth handles directly, not a per-action error). */
  | "authentication_unavailable"
  // Authorization kinds (Prompt 3, RBAC & Authorization Framework).
  /** The staff-profile (role/hostel) READ itself failed (network/DB error)
   * — distinct from "forbidden" (we know who you are and you lack
   * permission) and from "not_found" (a specific resource is missing).
   * AuthorizationContext treats this the same as "no staff profile" — fail
   * closed, never authorized. */
  | "authorization_unavailable"
  /** The staff-profile read SUCCEEDED but returned no profile at all — a
   * valid, MFA-verified Supabase identity that simply isn't a provisioned
   * staff member (Prompt 1 §20/§21: "authenticated identity but not an
   * authorized staff member" must fail closed, and must be distinguishable
   * from a transient fetch failure for diagnostic/support purposes, even
   * though both result in the same denied UI state today). */
  | "unauthorized_staff"
  | "unknown";

export class AppError extends Error {
  constructor(
    readonly kind: AppErrorKind,
    /** Safe to show a user as-is. Never derived from a raw backend/network
     * error's own message — see toAppError() below. */
    readonly userMessage: string,
    /** The original error, kept for logging only — never rendered. */
    readonly cause?: unknown,
  ) {
    super(userMessage);
    this.name = "AppError";
  }
}

const SAFE_MESSAGES: Record<AppErrorKind, string> = {
  network: "You appear to be offline. Please check your connection and try again.",
  unauthenticated: "Your session has expired. Please sign in again.",
  forbidden: "You don't have permission to do that.",
  not_found: "We couldn't find what you were looking for.",
  conflict: "This action can no longer be completed — the item may have already changed.",
  validation: "Please check the information you entered and try again.",
  realtime_unavailable: "Live updates are unavailable right now. Refresh to see the latest state.",
  invalid_credentials: "That email or password isn't correct. Please try again.",
  session_expired: "Your session has expired. Please sign in again.",
  mfa_challenge_failed: "We couldn't start a verification code check. Please try again.",
  mfa_verification_failed: "That code isn't correct or has expired. Please try again.",
  mfa_enrollment_failed: "We couldn't set up your authenticator app. Please try again.",
  authentication_unavailable: "Sign-in is temporarily unavailable. Please try again shortly.",
  authorization_unavailable: "We couldn't determine what you're allowed to do. Please try again.",
  unauthorized_staff: "This account isn't set up for reception dashboard access.",
  unknown: "Something went wrong. Please try again.",
};

/** Maps an arbitrary caught value to an AppError with a pre-approved safe
 * message — never passes the original error's own message through to the
 * UI. Backend detail classification (mapping actual HTTP status codes /
 * `{error:{code,message}}` bodies from the generated API client, or a raw
 * Supabase Auth error — see services/auth/authErrors.ts's mapAuthError)
 * belongs to the feature/service layer that knows that specific contract,
 * not this generic mapper — this is the fallback used when no more
 * specific classification is available. */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  return new AppError("unknown", SAFE_MESSAGES.unknown, err);
}

export function safeMessageFor(kind: AppErrorKind): string {
  return SAFE_MESSAGES[kind];
}
