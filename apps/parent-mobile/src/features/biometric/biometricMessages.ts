import type { BiometricResultKind } from "../../services/biometric/biometric";

/**
 * Pure per-result-kind messaging (Prompt 5) — mirrors
 * `features/authentication/statusMessages.ts`'s pattern, but richer:
 * biometric failure modes need materially different guidance (retry vs.
 * "enroll in device settings" vs. "use your passcode"), not one generic
 * error string. No React/RN import, independently unit-tested.
 *
 * Language is deliberately accurate about *who* performs authentication —
 * never "DigiHostel verified your fingerprint" or "your face was verified
 * by our server." The device operating system performs the check; this app
 * only observes the OS's own result.
 */
export interface BiometricResultMessage {
  title: string;
  description: string;
  /** Whether re-attempting the same authentication makes sense right now. */
  canRetry: boolean;
  /** Whether the user should be pointed at their device's own security
   * settings (enrollment, passcode) rather than retrying in-app. */
  suggestDeviceSettings: boolean;
}

const MESSAGES: Record<Exclude<BiometricResultKind, "success">, BiometricResultMessage> = {
  user_cancelled: {
    title: "Cancelled",
    description: "You cancelled authentication. You can try again anytime.",
    canRetry: true,
    suggestDeviceSettings: false,
  },
  authentication_failed: {
    title: "Authentication didn't match",
    description: "That didn't match. Please try again.",
    canRetry: true,
    suggestDeviceSettings: false,
  },
  temporary_lockout: {
    title: "Too many attempts",
    description: "Too many attempts. Try again in a moment, or use your device passcode.",
    canRetry: true,
    suggestDeviceSettings: false,
  },
  permanent_lockout: {
    title: "Locked out",
    description: "Biometric authentication is locked. Use your device passcode to continue.",
    canRetry: false,
    suggestDeviceSettings: true,
  },
  not_enrolled: {
    title: "Not set up on this device",
    description:
      "Set up a fingerprint, face unlock, or passcode in your device settings to use this.",
    canRetry: false,
    suggestDeviceSettings: true,
  },
  hardware_unavailable: {
    title: "Unavailable right now",
    description: "Biometric authentication isn't available on this device right now.",
    canRetry: true,
    suggestDeviceSettings: false,
  },
  not_supported: {
    title: "Not supported on this device",
    description: "This device doesn't support biometric authentication.",
    canRetry: false,
    suggestDeviceSettings: false,
  },
  system_cancelled: {
    title: "Interrupted",
    description: "Authentication was interrupted. Please try again.",
    canRetry: true,
    suggestDeviceSettings: false,
  },
  timeout: {
    title: "Timed out",
    description: "That took too long. Please try again.",
    canRetry: true,
    suggestDeviceSettings: false,
  },
  device_credential_required: {
    title: "Use your device passcode",
    description: "Confirm using your device passcode to continue.",
    canRetry: true,
    suggestDeviceSettings: false,
  },
  unknown_error: {
    title: "Something went wrong",
    description: "Something went wrong. Please try again.",
    canRetry: true,
    suggestDeviceSettings: false,
  },
};

export function biometricResultMessage(
  kind: Exclude<BiometricResultKind, "success">,
): BiometricResultMessage {
  return MESSAGES[kind];
}
