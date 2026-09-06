import { AppError, toAppError } from "../../types/errors";
import { DeviceServiceNotImplementedError } from "../../services/devices/deviceServiceErrors";

/**
 * Maps an error thrown by `deviceService`'s write operations to this app's
 * safe error taxonomy (Prompt 4B) — mirrors `services/supabase/authErrors.ts`'s
 * `mapAuthError` pattern: classify by type, never by pattern-matching a raw
 * message, and always resolve to a pre-approved `AppError` from
 * `src/types/errors.ts`.
 */
export function mapDeviceError(err: unknown, context: "register" | "revoke"): AppError {
  if (err instanceof AppError) return err;

  if (err instanceof DeviceServiceNotImplementedError) {
    return context === "register"
      ? new AppError(
          "device_registration_unavailable",
          "Device verification isn't available yet. Please try again later.",
          err,
        )
      : new AppError(
          "device_removal_unavailable",
          "Removing this device isn't available yet. Please try again later.",
          err,
        );
  }

  return toAppError(err);
}
