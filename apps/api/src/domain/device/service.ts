import { db, auditLogs } from "@digihostel/db";
import { logger } from "../../lib/logger.js";
import type { ChallengeRepository } from "./challengeRepository.js";
import {
  AttestationProviderNotConfiguredError,
  type AttestationVerifier,
} from "./attestationVerifier.js";
import type { TrustedDeviceRepository } from "./trustedDeviceRepository.js";
import type { DevicePlatform, DeviceRegistrationResult } from "./types.js";

/**
 * ADR-003 implementation — orchestrates the full server-controlled
 * registration flow described in the implementation task's §6/§10:
 *   issue challenge -> (client attests natively, out of this class's scope)
 *   -> redeem challenge + verify attestation -> only then create the
 *   trusted_devices row (delegated to TrustedDeviceRepository, never inlined
 *   here, so this orchestration logic stays unit-testable with fakes for
 *   every dependency — see service.test.ts).
 *
 * `registerCurrentDevice()` on the mobile client (src/services/devices/devices.ts)
 * is the caller-facing entry point this service exists to serve; this class
 * is reachable only via routes/devices.ts, never directly by any client.
 */
export class DeviceRegistrationService {
  constructor(
    private readonly challengeRepository: ChallengeRepository,
    private readonly attestationVerifier: AttestationVerifier,
    private readonly trustedDeviceRepository: TrustedDeviceRepository,
  ) {}

  async createChallenge(
    parentId: string,
    platform: DevicePlatform,
  ): Promise<{ challengeId: string; nonce: string; expiresAt: string }> {
    const challenge = await this.challengeRepository.create(parentId, platform);

    void this.writeAuditLog({
      actorId: parentId,
      action: "device.registration_challenge_issued",
      entityType: "device_registration_challenges",
      entityId: challenge.id,
      metadata: { platform },
    });

    return {
      challengeId: challenge.id,
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt.toISOString(),
    };
  }

  async registerDevice(input: {
    parentId: string;
    challengeId: string;
    platform: DevicePlatform;
    attestationToken: string;
    deviceFingerprint: string;
  }): Promise<DeviceRegistrationResult> {
    const challenge = await this.challengeRepository.consume(input.challengeId, input.parentId);
    if (!challenge) {
      // consume() returns null for every one of: unknown id, wrong owner,
      // already consumed, or expired. Deliberately not distinguished further
      // here (mirrors AuthOtpService's own anti-enumeration shape) — there is
      // no legitimate reason a caller needs to know which.
      this.auditRejection(input.parentId, input.challengeId, "challenge_redemption_failed");
      return { kind: "failure", reason: "challenge_not_found" };
    }

    if (challenge.platform !== input.platform) {
      this.auditRejection(input.parentId, challenge.id, "platform_mismatch");
      return { kind: "failure", reason: "attestation_rejected" };
    }

    let verification;
    try {
      verification = await this.attestationVerifier.verify({
        platform: input.platform,
        attestationToken: input.attestationToken,
        expectedNonce: challenge.nonce,
      });
    } catch (err) {
      if (err instanceof AttestationProviderNotConfiguredError) {
        this.auditRejection(input.parentId, challenge.id, "attestation_provider_not_configured");
        return { kind: "failure", reason: "attestation_provider_not_configured" };
      }
      this.auditRejection(input.parentId, challenge.id, "attestation_verification_error");
      return { kind: "failure", reason: "attestation_verification_error" };
    }

    if (!verification.passed) {
      this.auditRejection(
        input.parentId,
        challenge.id,
        `attestation_rejected:${verification.rejectionReason ?? "unknown"}`,
      );
      return { kind: "failure", reason: "attestation_rejected" };
    }

    // Only now — after a real, server-verified PASS — does a trusted_devices
    // row get created.
    const device = await this.trustedDeviceRepository.createTrustedDevice({
      parentId: input.parentId,
      platform: input.platform,
      deviceFingerprint: input.deviceFingerprint,
      attestationProvider: verification.provider,
    });

    return { kind: "success", device };
  }

  private auditRejection(parentId: string, challengeOrEntityId: string, reason: string): void {
    // device_attestation_events cannot record this (its trusted_device_id FK
    // is NOT NULL — no device exists yet for a rejected attempt), so a
    // rejected/failed attestation is recorded in audit_logs instead, keyed by
    // the challenge id rather than a (non-existent) device id.
    void this.writeAuditLog({
      actorId: parentId,
      action: "device.attestation_rejected",
      entityType: "device_registration_challenges",
      entityId: challengeOrEntityId,
      metadata: { reason },
    });
  }

  /** Fire-and-forget, matching AuthOtpService's own "a provider-side failure
   * must not fail the primary operation" convention (service.ts's own doc
   * comment on requestOtp) — an audit-log write failure must never block or
   * fail a security decision that has already been made. This also means the
   * security-relevant branching logic in registerDevice()/createChallenge()
   * above needs no database connection at all to unit-test (see
   * service.test.ts), only this incidental side effect does, and it degrades
   * safely when one isn't available. */
  private async writeAuditLog(entry: {
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    try {
      await db.insert(auditLogs).values({ actorType: "parent", ...entry });
    } catch (err) {
      logger.warn({ err, action: entry.action }, "device: audit log write failed");
    }
  }
}
