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
  | "invalid_phone_number"
  | "otp_send_failed"
  | "otp_expired"
  | "otp_invalid"
  | "otp_rate_limited"
  | "auth_provider_unavailable"
  | "session_restore_failed"
  | "session_refresh_failed"
  | "device_not_trusted"
  | "device_revoked"
  | "device_registration_unavailable";

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
  invalid_phone_number: "Please enter a valid mobile number.",
  otp_send_failed: "We couldn't send a verification code. Please try again.",
  otp_expired: "That code has expired. Please request a new one.",
  otp_invalid: "That code isn't correct. Please check and try again.",
  otp_rate_limited: "Too many attempts. Please wait a moment before trying again.",
  auth_provider_unavailable: "Sign-in is temporarily unavailable. Please try again shortly.",
  session_restore_failed: "We couldn't restore your session. Please sign in again.",
  session_refresh_failed: "Your session couldn't be renewed. Please sign in again.",
  device_not_trusted: "This device isn't verified yet.",
  device_revoked: "This device's access has been revoked.",
  device_registration_unavailable:
    "Device verification isn't available yet. Please try again later.",
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
