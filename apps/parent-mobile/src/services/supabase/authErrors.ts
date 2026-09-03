import { isAuthApiError, isAuthRetryableFetchError } from "@supabase/supabase-js";
import { AppError, safeMessageFor, toAppError, type AppErrorKind } from "../../types/errors";

/**
 * Maps a raw error thrown by Supabase Auth's phone-OTP calls
 * (`signInWithOtp`/`verifyOtp`) to this app's safe error taxonomy —
 * classifies using `@supabase/supabase-js`'s own documented error-code enum
 * and type guards (`isAuthApiError`/`isAuthRetryableFetchError`), never by
 * pattern-matching the raw message for anything shown to the user. The raw
 * error's `.code`/`.status` are inspected only to CLASSIFY; the resulting
 * `AppError.userMessage` always comes from the pre-approved taxonomy in
 * src/types/errors.ts, never from the Supabase error itself.
 */
export function mapAuthError(err: unknown, context: "send_otp" | "verify_otp"): AppError {
  if (err instanceof AppError) return err;

  if (isAuthRetryableFetchError(err)) {
    return new AppError("network", safeMessageFor("network"), err);
  }

  if (isAuthApiError(err)) {
    const kind = classifyAuthApiErrorCode(err.code, context);
    return new AppError(kind, safeMessageFor(kind), err);
  }

  return toAppError(err);
}

function classifyAuthApiErrorCode(
  code: string | undefined,
  context: "send_otp" | "verify_otp",
): AppErrorKind {
  switch (code) {
    case "over_sms_send_rate_limit":
    case "over_request_rate_limit":
      return "otp_rate_limited";
    case "sms_send_failed":
    case "phone_provider_disabled":
      return "otp_send_failed";
    case "otp_expired":
      return "otp_expired";
    case "invalid_credentials":
    case "otp_disabled":
      return "otp_invalid";
    case "validation_failed":
      // The only client-supplied input to these two calls is the phone
      // number (send_otp) or the code (verify_otp) — validation_failed in
      // either context means the phone number was malformed, since the
      // code field has no format Supabase validates beyond presence.
      return context === "send_otp" ? "invalid_phone_number" : "otp_invalid";
    case "session_expired":
    case "session_not_found":
      return "session_restore_failed";
    case "refresh_token_not_found":
    case "refresh_token_already_used":
      return "session_refresh_failed";
    default:
      return "auth_provider_unavailable";
  }
}
