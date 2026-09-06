import * as LocalAuthentication from "expo-local-authentication";
import { Platform } from "react-native";
import { randomUUID } from "expo-crypto";
import { mapPlatformAuthError } from "./biometricErrors";
import { logger } from "../logger/logger";

/**
 * Biometric authentication service (Prompt 2 foundation — interface only,
 * fail-closed placeholder; made real in Prompt 5 via `expo-local-authentication`).
 *
 * Critical boundary, restated here because it matters most at this exact
 * file: a resolved `{ kind: "success" }` from this service means **the
 * device OS successfully authenticated the device owner using an enrolled
 * local authentication method** — nothing more. It does NOT mean the user
 * has been cryptographically identified by this app, that platform
 * attestation (ADR-003) has passed, that a trusted device has been
 * registered, that the backend has verified anything, or that any backend
 * authorization has been granted. See docs/authentication.md §16 for the
 * full boundary explanation.
 *
 * This service never stores, transmits, or exposes biometric data —
 * `expo-local-authentication` itself never gives this app access to any
 * biometric template/image; only a `{success, error?}` result. Nothing this
 * file does could leak biometric data even if it tried.
 */

export type BiometricAuthenticationMethod = "fingerprint" | "facial" | "iris";

/** Android exposes a strong/weak distinction (Class 3 vs Class 2
 * biometrics); iOS biometrics are always effectively strong (no weak
 * biometric option exists on iOS per `expo-local-authentication`'s own
 * doc comment). `device_credential` means only a PIN/pattern/password is
 * enrolled, no biometric at all. */
export type BiometricSecurityLevel =
  "none" | "device_credential" | "biometric_weak" | "biometric_strong";

export interface BiometricCapabilities {
  hardwareAvailable: boolean;
  enrolled: boolean;
  supportedMethods: BiometricAuthenticationMethod[];
  securityLevel: BiometricSecurityLevel;
  /** Derived, not independently queried: any enrolled level above "none"
   * necessarily means a device credential exists too, since both platforms
   * require one as a prerequisite for biometric enrollment. */
  deviceCredentialAvailable: boolean;
}

export type BiometricResultKind =
  | "success"
  | "user_cancelled"
  | "authentication_failed"
  | "temporary_lockout"
  | "permanent_lockout"
  | "not_enrolled"
  | "hardware_unavailable"
  | "not_supported"
  | "system_cancelled"
  | "timeout"
  | "device_credential_required"
  | "unknown_error";

export interface BiometricAuthResult {
  kind: BiometricResultKind;
}

/**
 * The one thing this app ever sends anywhere as a result of a local
 * biometric event. `assertionToken` is an opaque, freshly-generated random
 * UUID minted client-side immediately after a real successful local OS
 * authentication — it is NOT a cryptographic proof of anything, and this
 * service makes no claim that it is. It exists to satisfy the exact shape
 * the backend's current (explicitly non-cryptographic, placeholder)
 * `AssertionPresenceBiometricFreshnessGate` checks — a non-empty,
 * action-bound token — per `apps/api/src/lib/auth/security-gates.ts` and
 * `docs/target-architecture.md`'s "biometric verification... only the
 * resulting assertion... is sent" model. See docs/authentication.md §16
 * for the full limitation this implies.
 */
export interface BiometricAssertion {
  assertionToken: string;
  actionId: string;
}

export type BiometricStepUpResult =
  | { kind: "success"; assertion: BiometricAssertion }
  | { kind: Exclude<BiometricResultKind, "success"> };

export interface BiometricService {
  getCapabilities(): Promise<BiometricCapabilities>;
  /** Plain local authentication — no action-binding. Used by the
   * enable-biometrics flow, which needs a real successful authentication
   * but has no backend action to bind it to. */
  authenticate(promptMessage: string): Promise<BiometricAuthResult>;
  /** Sensitive-action step-up — authenticates, then (only on success)
   * produces a `BiometricAssertion` shaped for a future protected-action
   * request body. Never fabricates an assertion on anything but a real
   * platform success. */
  createAssertion(actionId: string, promptMessage: string): Promise<BiometricStepUpResult>;
  /** Best-effort; Android only (`expo-local-authentication`'s own platform
   * restriction). No-ops on iOS/web rather than throwing. */
  cancelAuthentication(): Promise<void>;
}

function mapAuthenticationMethod(
  type: LocalAuthentication.AuthenticationType,
): BiometricAuthenticationMethod | null {
  switch (type) {
    case LocalAuthentication.AuthenticationType.FINGERPRINT:
      return "fingerprint";
    case LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION:
      return "facial";
    case LocalAuthentication.AuthenticationType.IRIS:
      return "iris";
    default:
      return null;
  }
}

function mapSecurityLevel(level: LocalAuthentication.SecurityLevel): BiometricSecurityLevel {
  switch (level) {
    case LocalAuthentication.SecurityLevel.NONE:
      return "none";
    case LocalAuthentication.SecurityLevel.SECRET:
      return "device_credential";
    case LocalAuthentication.SecurityLevel.BIOMETRIC_WEAK:
      return "biometric_weak";
    case LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG:
      return "biometric_strong";
    default:
      return "none";
  }
}

const UNAVAILABLE_CAPABILITIES: BiometricCapabilities = {
  hardwareAvailable: false,
  enrolled: false,
  supportedMethods: [],
  securityLevel: "none",
  deviceCredentialAvailable: false,
};

async function getCapabilities(): Promise<BiometricCapabilities> {
  try {
    const [hardwareAvailable, enrolled, types, level] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
      LocalAuthentication.getEnrolledLevelAsync(),
    ]);
    return {
      hardwareAvailable,
      enrolled,
      supportedMethods: types
        .map(mapAuthenticationMethod)
        .filter((method): method is BiometricAuthenticationMethod => method !== null),
      securityLevel: mapSecurityLevel(level),
      deviceCredentialAvailable: level !== LocalAuthentication.SecurityLevel.NONE,
    };
  } catch (err) {
    // Fail closed: an unexpected native-module error must never be
    // interpreted as "biometrics are available."
    logger.warn("biometric: capability check failed", { err });
    return UNAVAILABLE_CAPABILITIES;
  }
}

/**
 * `biometricsSecurityLevel: "strong"` (Android only; iOS has no weak
 * biometric concept per the library's own doc comment) is a deliberate
 * default for every authentication call this service makes — not an
 * SDD-mandated literal value (the SDD does not specify this parameter),
 * but a defensible engineering judgment: this app gates approval of a
 * minor's hostel leave and removal of trusted-device access, and a weak,
 * spoofable 2D-camera face unlock (Android Class 2) should not be treated
 * as equivalent to a fingerprint or 3D face scan (Class 3) for those
 * actions. `disableDeviceFallback` stays `false`, so a device that only has
 * weak biometric enrolled still lets the user complete authentication via
 * their device passcode instead — this setting narrows which biometric
 * methods qualify, it does not lock out users who lack a strong method.
 */
const AUTHENTICATE_OPTIONS: Pick<
  LocalAuthentication.LocalAuthenticationOptions,
  "disableDeviceFallback" | "biometricsSecurityLevel"
> = {
  disableDeviceFallback: false,
  biometricsSecurityLevel: "strong",
};

async function authenticate(promptMessage: string): Promise<BiometricAuthResult> {
  const capabilities = await getCapabilities();
  if (!capabilities.hardwareAvailable) {
    return { kind: "not_supported" };
  }
  if (!capabilities.enrolled) {
    return { kind: "not_enrolled" };
  }

  logger.info("biometric: authentication requested");
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      ...AUTHENTICATE_OPTIONS,
    });
    if (result.success) {
      logger.info("biometric: authentication succeeded");
      return { kind: "success" };
    }
    const kind = mapPlatformAuthError(result.error);
    logger.info("biometric: authentication did not succeed", { kind });
    return { kind };
  } catch (err) {
    logger.warn("biometric: authentication threw unexpectedly", { err });
    return { kind: "unknown_error" };
  }
}

async function createAssertion(
  actionId: string,
  promptMessage: string,
): Promise<BiometricStepUpResult> {
  const result = await authenticate(promptMessage);
  if (result.kind === "success") {
    return { kind: "success", assertion: { assertionToken: randomUUID(), actionId } };
  }
  return { kind: result.kind };
}

async function cancelAuthentication(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await LocalAuthentication.cancelAuthenticate();
  } catch (err) {
    logger.warn("biometric: cancelAuthentication failed", { err });
  }
}

export const biometricService: BiometricService = {
  getCapabilities,
  authenticate,
  createAssertion,
  cancelAuthentication,
};
