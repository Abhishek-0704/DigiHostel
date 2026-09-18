import {
  eq,
  isNull,
  and,
  db,
  auditLogs,
  trustedDevices,
  deviceAttestationEvents,
} from "@digihostel/db";
import type { DevicePlatform, TrustedDeviceView } from "./types.js";

/**
 * ADR-003 implementation — the ONLY path that may ever create a
 * `trusted_devices` row, gated entirely behind `DeviceRegistrationService`
 * having already obtained a real, server-verified attestation PASS. Kept as
 * its own injectable port (rather than inlined into
 * `DeviceRegistrationService`) purely so that service's orchestration logic
 * — including its failure-path branching — can be unit-tested with a fake,
 * exactly like `ChallengeRepository`/`AttestationVerifier`; the real
 * Postgres-backed behavior below is covered by
 * `trustedDeviceRepository.integration.test.ts` instead.
 */
export interface TrustedDeviceRepository {
  /** Creates a new trusted, active device for `parentId`, or returns the
   * already-active device sharing the same fingerprint if one exists
   * (idempotent retry safety) — never creates a second active row for the
   * same (parentId, deviceFingerprint) pair, matching the unique index
   * `trusted_devices_parent_fingerprint_key`. Also writes the
   * `device_attestation_events` "pass" record and an `audit_logs` entry, in
   * the same transaction as the device row itself. */
  createTrustedDevice(input: {
    parentId: string;
    platform: DevicePlatform;
    deviceFingerprint: string;
    attestationProvider: "play_integrity" | "app_attest" | "device_check";
  }): Promise<TrustedDeviceView>;
}

export class DrizzleTrustedDeviceRepository implements TrustedDeviceRepository {
  async createTrustedDevice(input: {
    parentId: string;
    platform: DevicePlatform;
    deviceFingerprint: string;
    attestationProvider: "play_integrity" | "app_attest" | "device_check";
  }): Promise<TrustedDeviceView> {
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: trustedDevices.id, registeredAt: trustedDevices.registeredAt })
        .from(trustedDevices)
        .where(
          and(
            eq(trustedDevices.parentId, input.parentId),
            eq(trustedDevices.deviceFingerprint, input.deviceFingerprint),
            isNull(trustedDevices.revokedAt),
          ),
        )
        .limit(1);

      const deviceRow =
        existing ??
        (
          await tx
            .insert(trustedDevices)
            .values({
              parentId: input.parentId,
              platform: input.platform,
              deviceFingerprint: input.deviceFingerprint,
            })
            .returning()
        )[0];

      await tx.insert(deviceAttestationEvents).values({
        trustedDeviceId: deviceRow.id,
        result: "pass",
        provider: input.attestationProvider,
      });

      await tx.insert(auditLogs).values({
        actorType: "parent",
        actorId: input.parentId,
        action: "device.trusted",
        entityType: "trusted_devices",
        entityId: deviceRow.id,
        metadata: { platform: input.platform, provider: input.attestationProvider },
      });

      return {
        id: deviceRow.id,
        platform: input.platform,
        registeredAt: deviceRow.registeredAt.toISOString(),
      };
    });
  }
}
