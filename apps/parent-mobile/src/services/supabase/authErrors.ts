import { isAuthApiError, isAuthRetryableFetchError } from "@supabase/supabase-js";
import { AppError, safeMessageFor, toAppError, type AppErrorKind } from "../../types/errors";

/**
 * Maps a raw error thrown by `AuthService.adoptSession`'s `setSession` call
 * to this app's safe error taxonomy — classifies using
 * `@supabase/supabase-js`'s own documented error-code enum and type guards
 * (`isAuthApiError`/`isAuthRetryableFetchError`), never by pattern-matching
 * the raw message for anything shown to the user. The raw error's
 * `.code`/`.status` are inspected only to CLASSIFY; the resulting
 * `AppError.userMessage` always comes from the pre-approved taxonomy in
 * src/types/errors.ts, never from the Supabase error itself.
 */
export function mapAuthError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (isAuthRetryableFetchError(err)) {
    return new AppError("network", safeMessageFor("network"), err);
  }

  if (isAuthApiError(err)) {
    const kind = classifyAuthApiErrorCode(err.code);
    return new AppError(kind, safeMessageFor(kind), err);
  }

  return toAppError(err);
}

function classifyAuthApiErrorCode(code: string | undefined): AppErrorKind {
  switch (code) {
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
