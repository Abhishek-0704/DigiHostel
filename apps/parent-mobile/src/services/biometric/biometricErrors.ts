import type { LocalAuthenticationError } from "expo-local-authentication";
import type { BiometricResultKind } from "./biometric";

/**
 * Pure mapping from `expo-local-authentication`'s platform error strings to
 * this app's own `BiometricResultKind` taxonomy (Prompt 5) — mirrors
 * `services/supabase/authErrors.ts`'s `mapAuthError` pattern: classify by
 * the SDK's own typed value, never by a message string, and never expose
 * the raw platform string to a screen.
 *
 * `expo-local-authentication` collapses Android's `ERROR_LOCKOUT` and
 * `ERROR_LOCKOUT_PERMANENT` into a single `'lockout'` string — there is no
 * way to distinguish temporary from permanent lockout through this library's
 * public API. This mapper therefore only ever produces `temporary_lockout`
 * (the safe, always-true reading: retry may work once the platform's own
 * timeout elapses, or the OS's own passcode fallback remains available
 * either way since `disableDeviceFallback` stays `false`). `permanent_lockout`
 * remains a defined `BiometricResultKind` for API completeness and any
 * future platform API that does expose the distinction — it is correctly
 * typed, just currently unreachable from this mapper, the same
 * documented-but-unreachable pattern this app already uses elsewhere (e.g.
 * `SuccessState` on the device-registration screen).
 */
export function mapPlatformAuthError(error: LocalAuthenticationError): BiometricResultKind {
  switch (error) {
    case "not_enrolled":
    case "passcode_not_set":
      // `passcode_not_set` (iOS): no device passcode exists at all, which
      // also means biometric enrollment is impossible — the actionable
      // guidance ("set this up in device settings") is identical to
      // not_enrolled, so no separate app-level category is invented for it.
      return "not_enrolled";
    case "user_cancel":
      return "user_cancelled";
    case "app_cancel":
    case "system_cancel":
    case "invalid_context":
      return "system_cancelled";
    case "not_available":
      return "hardware_unavailable";
    case "lockout":
      return "temporary_lockout";
    case "timeout":
      return "timeout";
    case "user_fallback":
      return "device_credential_required";
    case "unable_to_process":
    case "authentication_failed":
      return "authentication_failed";
    case "no_space":
    case "unknown":
      return "unknown_error";
    default:
      return "unknown_error";
  }
}
