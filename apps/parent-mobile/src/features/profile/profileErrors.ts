import { AppError, safeMessageFor } from "../../types/errors";

/**
 * Maps an error from `profileService` to this app's safe error taxonomy
 * (Prompt 11) — mirrors `features/devices/deviceErrors.ts`'s `mapDeviceError`
 * pattern. `profileService` throws a raw Supabase/PostgREST error object
 * (never a typed domain error, unlike `leaveErrors.ts`'s
 * `ApprovalServiceNotImplementedError`), so this always falls through to a
 * fixed, safe, context-specific message — the underlying error is kept only
 * as `cause`, for logging, never rendered.
 */
export function mapProfileError(err: unknown, context: "read" | "write" = "read"): AppError {
  if (err instanceof AppError) return err;
  const kind = context === "write" ? "profile_update_failed" : "profile_unavailable";
  return new AppError(kind, safeMessageFor(kind), err);
}
