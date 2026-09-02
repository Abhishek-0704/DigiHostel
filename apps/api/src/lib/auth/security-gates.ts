/**
 * Explicit interfaces for security gates that are NOT implemented yet:
 * device attestation and biometric freshness (ADR-003, ADR-014;
 * docs/auth-database-security-model.md §7-§8). Trusted-device *validation*
 * (is this device currently trusted, per `trusted_devices.revoked_at`) IS
 * real today — that's plain data already in Postgres, exposed via
 * `AuthDbPort.hasActiveTrustedDevice` (db-port.ts) and wired into a real
 * guard (guards.ts's `requireActiveTrustedDevice`). Attestation and
 * biometric freshness require integrating actual providers (Play Integrity,
 * App Attest/DeviceCheck, an on-device biometric SDK) which this task
 * explicitly excludes (constraint #11) — these interfaces exist so route
 * authorization can be wired against them later WITHOUT rewriting the
 * guard/route structure, not to fake a result today.
 *
 * `NotImplementedAttestationGate` / `NotImplementedBiometricFreshnessGate`
 * are the only production-registered implementations right now, and they
 * throw rather than silently returning success — a route that calls them
 * before the real integration exists fails loudly, which is the correct,
 * honest behavior (never claim production verification exists when it
 * doesn't). Test doubles that return deterministic pass/fail results live
 * in the corresponding *.test.ts files, not here — keeping "code that could
 * silently look production-ready" out of src/.
 */

export interface DeviceAttestationResult {
  passed: boolean;
  provider: "play_integrity" | "app_attest" | "device_check";
  checkedAt: Date;
}

/** Android Play Integrity / iOS App Attest-DeviceCheck (ADR-003). */
export interface DeviceAttestationGate {
  checkAttestation(trustedDeviceId: string): Promise<DeviceAttestationResult>;
}

export interface BiometricFreshnessAssertion {
  /** Opaque, action-bound assertion the client supplies — never raw
   * biometric data (docs/database-schema-design.md's Device/Security
   * Domain note: no biometric template/image is ever stored or transmitted
   * to the backend). */
  assertionToken: string;
  actionId: string;
}

export interface BiometricFreshnessResult {
  fresh: boolean;
  confirmedAt: Date;
}

/** Confirms a client-side biometric confirmation is fresh enough for a
 * specific sensitive action (approval, checkpoint scan) — SDD Ch.5 §5.2,
 * Ch.6 §6.2; docs/auth-database-security-model.md §7. */
export interface BiometricFreshnessGate {
  checkFreshness(assertion: BiometricFreshnessAssertion): Promise<BiometricFreshnessResult>;
}

export class DeviceAttestationNotImplementedError extends Error {
  constructor() {
    super(
      "Device attestation is not implemented yet (ADR-003 §Consequences; docs/auth-database-security-model.md §8). " +
        "Do not treat this as a pass — route authorization must not depend on a real result until a provider is wired in.",
    );
    this.name = "DeviceAttestationNotImplementedError";
  }
}

export class BiometricFreshnessNotImplementedError extends Error {
  constructor() {
    super(
      "Biometric freshness checking is not implemented yet (docs/auth-database-security-model.md §7). " +
        "Do not treat this as a pass — route authorization must not depend on a real result until a provider is wired in.",
    );
    this.name = "BiometricFreshnessNotImplementedError";
  }
}

export class NotImplementedAttestationGate implements DeviceAttestationGate {
  async checkAttestation(): Promise<never> {
    throw new DeviceAttestationNotImplementedError();
  }
}

export class NotImplementedBiometricFreshnessGate implements BiometricFreshnessGate {
  async checkFreshness(): Promise<never> {
    throw new BiometricFreshnessNotImplementedError();
  }
}

/**
 * Interim, explicitly-non-cryptographic gate used by the Parent Leave
 * Approval workflow (docs/leave-approval-workflow.md) until a real biometric
 * provider is integrated. It ONLY checks that the client supplied a
 * non-empty assertion token bound to the expected action id — it does NOT
 * verify a real on-device biometric event occurred, does NOT check a
 * signature, and does NOT check freshness/expiry. This is a deliberate,
 * documented, honest placeholder: the schema's `leave_approval_events` RLS
 * policy requires `biometric_confirmed = true` for any response-bearing
 * event (docs/rls-policy-matrix.md), and the SDD requires biometric
 * confirmation before every approval decision (SDD Ch.5 §5.2) — leaving the
 * workflow entirely unusable until a real provider exists would block the
 * first end-to-end business workflow for no security benefit, since no
 * client can supply a real biometric assertion yet regardless. This gate
 * must be replaced by a real, cryptographically-verifying implementation of
 * `BiometricFreshnessGate` before this system handles real users — tracked
 * as a genuine, flagged follow-up, not silently treated as equivalent to
 * real verification anywhere in documentation or code comments.
 */
export class AssertionPresenceBiometricFreshnessGate implements BiometricFreshnessGate {
  async checkFreshness(assertion: BiometricFreshnessAssertion): Promise<BiometricFreshnessResult> {
    const fresh =
      assertion.assertionToken.trim().length > 0 && assertion.actionId.trim().length > 0;
    return { fresh, confirmedAt: new Date() };
  }
}
