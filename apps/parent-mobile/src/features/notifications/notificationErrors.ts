import { AppError, safeMessageFor, toAppError } from "../../types/errors";
import { NotificationActionNotSupportedError } from "../../services/notifications/notificationActions";

/**
 * Maps an error thrown by notification services to this app's safe error
 * taxonomy (Prompt 8) — mirrors `features/devices/deviceErrors.ts`'s
 * `mapDeviceError` pattern: classify by type, never by pattern-matching a
 * raw message.
 */
export function mapNotificationError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (err instanceof NotificationActionNotSupportedError) {
    // Uses the taxonomy's own safe message rather than `err.message`
    // (RC1 hardening — this is currently harmless, since that error's
    // message is itself a hardcoded safe string, but every sibling mapper
    // derives the user-facing message from `safeMessageFor`, never a raw
    // error's own message, so a future edit to this error type can't
    // accidentally start leaking internal detail through this path).
    return new AppError(
      "notification_action_unavailable",
      safeMessageFor("notification_action_unavailable"),
      err,
    );
  }

  return toAppError(err);
}
