/**
 * Biometric verification service interface (Prompt 2 foundation).
 *
 * Mirrors the backend's own honest-placeholder pattern exactly
 * (apps/api/src/lib/auth/security-gates.ts's NotImplementedBiometricFreshnessGate):
 * the interface shape is defined so feature code can be written against it
 * later without a structural rewrite, but the only implementation provided
 * in this prompt throws rather than silently succeeding. `expo-local-authentication`
 * is not installed in this pass — installing it and implementing a real
 * on-device check is explicitly a future prompt's responsibility (Prompt 1's
 * roadmap, Phase 4), not this one's.
 *
 * Never treat a resolved promise from a future real implementation as proof
 * by itself for a server-side decision — the backend's own biometric gate
 * (AssertionPresenceBiometricFreshnessGate) is a documented, temporary
 * placeholder; this client-side interface existing does not change that.
 */

export interface BiometricCheckResult {
  success: boolean;
  /** Present when success is false. */
  reason?: "not_available" | "not_enrolled" | "cancelled" | "failed" | "unknown";
}

export interface BiometricService {
  isAvailable(): Promise<boolean>;
  authenticate(promptMessage: string): Promise<BiometricCheckResult>;
}

export class BiometricNotImplementedError extends Error {
  constructor() {
    super(
      "Biometric verification is not implemented yet in the Parent app " +
        "(Prompt 2 foundation only — expo-local-authentication is not installed). " +
        "Do not treat this as a pass.",
    );
    this.name = "BiometricNotImplementedError";
  }
}

export class NotImplementedBiometricService implements BiometricService {
  async isAvailable(): Promise<never> {
    throw new BiometricNotImplementedError();
  }
  async authenticate(): Promise<never> {
    throw new BiometricNotImplementedError();
  }
}

export const biometricService: BiometricService = new NotImplementedBiometricService();
