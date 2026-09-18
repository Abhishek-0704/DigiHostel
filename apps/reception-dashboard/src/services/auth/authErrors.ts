import { isAuthApiError, isAuthRetryableFetchError, type AuthError } from "@supabase/supabase-js";
import { AppError, safeMessageFor, toAppError, type AppErrorKind } from "../../lib/errors/errors";

/**
 * Maps a raw error thrown by `authService`/`mfaService` calls to this app's
 * safe error taxonomy — mirrors
 * apps/parent-mobile/src/services/supabase/authErrors.ts's exact pattern
 * (same type guards, same "classify by code, never by message" discipline),
 * adapted to this app's own error kinds. Reused, not reinvented (Prompt 1
 * §23: "reuse the existing application error system").
 *
 * Every `code` value switched on below was read directly from the installed
 * `@supabase/auth-js@2.113.0`'s own `ErrorCode` type
 * (`node_modules/.pnpm/@supabase+auth-js@.../lib/error-codes.d.ts`) — not
 * guessed from documentation memory.
 */
export function mapAuthError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (isAuthRetryableFetchError(err)) {
    return new AppError("network", safeMessageFor("network"), err);
  }

  if (isAuthApiError(err)) {
    const kind = classifyAuthApiErrorCode(err);
    return new AppError(kind, safeMessageFor(kind), err);
  }

  return toAppError(err);
}

function classifyAuthApiErrorCode(err: AuthError & { code?: string }): AppErrorKind {
  switch (err.code) {
    case "invalid_credentials":
      return "invalid_credentials";

    case "session_expired":
    case "session_not_found":
    case "refresh_token_not_found":
    case "refresh_token_already_used":
      return "session_expired";

    case "mfa_factor_not_found":
    case "mfa_challenge_expired":
    case "too_many_enrolled_mfa_factors":
    case "mfa_totp_enroll_not_enabled":
    case "mfa_verified_factor_exists":
      return "mfa_challenge_failed";

    case "mfa_verification_failed":
    case "mfa_verification_rejected":
    case "insufficient_aal":
      return "mfa_verification_failed";

    case "over_request_rate_limit":
    case "user_banned":
    case "email_not_confirmed":
      return "authentication_unavailable";

    default:
      return "authentication_unavailable";
  }
}
