import { randomUUID } from "node:crypto";
import type { TrustedDeviceRepository } from "../trustedDeviceRepository.js";
import type { TrustedDeviceView } from "../types.js";

/** In-memory fake for DeviceRegistrationService unit tests. Tracks every
 * call so a test can assert this was reached only after a genuine
 * attestation PASS — never on a rejection/error path. */
export class FakeTrustedDeviceRepository implements TrustedDeviceRepository {
  public readonly created: Array<{ parentId: string; deviceFingerprint: string }> = [];

  async createTrustedDevice(input: {
    parentId: string;
    platform: "android" | "ios";
    deviceFingerprint: string;
    attestationProvider: "play_integrity" | "app_attest" | "device_check";
  }): Promise<TrustedDeviceView> {
    this.created.push({ parentId: input.parentId, deviceFingerprint: input.deviceFingerprint });
    return {
      id: randomUUID(),
      platform: input.platform,
      registeredAt: new Date().toISOString(),
    };
  }
}
