/**
 * Application error taxonomy (Prompt 2 foundation, extended in Prompt 3 with
 * authentication/device-specific kinds). Mirrors the backend's own
 * typed-error / safe-message discipline
 * (apps/api/src/domain/leave/errors.ts, apps/api/src/lib/errorHandler.ts —
 * G-01): a small set of known error kinds with pre-approved, safe,
 * user-facing messages, plus a catch-all for anything unexpected that must
 * never surface raw detail to the user.
 */

export type AppErrorKind =
  | "network"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation"
  | "unknown"
  // Auth/device kinds (Prompt 3):
  | "otp_invalid"
  | "otp_rate_limited"
  | "auth_provider_unavailable"
  | "session_restore_failed"
  | "session_refresh_failed"
  | "device_not_trusted"
  | "device_revoked"
  | "device_registration_unavailable"
  | "device_removal_unavailable"
  // Notification kinds (Prompt 8):
  | "notification_unavailable"
  | "notification_action_unavailable"
  | "realtime_unavailable"
  // Leave approval kinds (Prompt 9A):
  | "leave_approval_unavailable"
  // Leave approval kinds (Prompt 9B): the backend's biometric-freshness
  // gate (currently AssertionPresenceBiometricFreshnessGate, an explicitly
  // non-cryptographic placeholder — apps/api/src/lib/auth/security-gates.ts)
  // rejected the submitted assertion. Distinct from the generic "forbidden"
  // because the correct next step differs (re-attempt biometric step-up,
  // not "you lack permission").
  | "biometric_verification_failed"
  // Profile kinds (Prompt 11):
  | "profile_unavailable"
  | "profile_update_failed";

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
  unknown: "Something went wrong. Please try again.",
  otp_invalid: "That code isn't correct or has expired. Please check and try again.",
  otp_rate_limited: "Too many attempts. Please wait a moment before trying again.",
  auth_provider_unavailable: "Sign-in is temporarily unavailable. Please try again shortly.",
  session_restore_failed: "We couldn't restore your session. Please sign in again.",
  session_refresh_failed: "Your session couldn't be renewed. Please sign in again.",
  device_not_trusted: "This device isn't verified yet.",
  device_revoked: "This device's access has been revoked.",
  device_registration_unavailable:
    "Device verification isn't available yet. Please try again later.",
  device_removal_unavailable: "Removing this device isn't available yet. Please try again later.",
  notification_unavailable: "We couldn't load your notifications. Please try again.",
  notification_action_unavailable: "This action isn't available yet. Please check back later.",
  realtime_unavailable: "Live updates are unavailable right now. Pull to refresh instead.",
  leave_approval_unavailable:
    "Leave approval isn't available in this version of the app yet. Please check back soon.",
  biometric_verification_failed: "We couldn't verify you securely. Please try again.",
  profile_unavailable: "We couldn't load your profile. Please try again.",
  profile_update_failed: "We couldn't save your changes. Please try again.",
};

/** Maps an arbitrary caught value (a thrown fetch error, a generated
 * client's CustomFetchError, or anything else) to an AppError with a
 * pre-approved safe message — never passes the original error's own
 * message through to the UI. Backend detail classification (mapping actual
 * HTTP status codes / `{error:{code,message}}` bodies from the generated
 * API client) belongs to the feature/service layer that knows that
 * contract, not this generic mapper — this is the fallback used when no
 * more specific classification is available. */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  return new AppError("unknown", SAFE_MESSAGES.unknown, err);
}

export function safeMessageFor(kind: AppErrorKind): string {
  return SAFE_MESSAGES[kind];
}
