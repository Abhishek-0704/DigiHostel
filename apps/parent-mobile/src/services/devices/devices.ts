/**
 * Trusted-device service interface (Prompt 2 foundation).
 *
 * Blocked on backend capability, not just unimplemented locally: per the
 * Prompt 1 planning document (§13, Risk #1) and ADR-003, device
 * registration requires platform attestation (Play Integrity / App
 * Attest), and the backend has no device-registration or
 * attestation-verification endpoint yet
 * (apps/api/src/lib/auth/security-gates.ts's NotImplementedAttestationGate
 * is fail-closed and unreachable — no route calls it). This interface must
 * not be implemented against a fabricated success path merely because the
 * shape is known; that would misrepresent a mandatory security control as
 * working when it isn't, on either side of the client/server boundary.
 */

export interface TrustedDeviceSummary {
  id: string;
  platform: "ios" | "android";
  registeredAt: string;
  isCurrentDevice: boolean;
}

export interface DeviceService {
  listTrustedDevices(): Promise<TrustedDeviceSummary[]>;
  registerCurrentDevice(): Promise<TrustedDeviceSummary>;
  revokeDevice(deviceId: string): Promise<void>;
}

export class DeviceServiceNotImplementedError extends Error {
  constructor() {
    super(
      "Trusted-device management is not implemented yet — the backend has no " +
        "device-registration or attestation-verification endpoint (see docs/current-state.md's " +
        "G-04 status). Do not fabricate a success path for this.",
    );
    this.name = "DeviceServiceNotImplementedError";
  }
}

export class NotImplementedDeviceService implements DeviceService {
  async listTrustedDevices(): Promise<never> {
    throw new DeviceServiceNotImplementedError();
  }
  async registerCurrentDevice(): Promise<never> {
    throw new DeviceServiceNotImplementedError();
  }
  async revokeDevice(): Promise<never> {
    throw new DeviceServiceNotImplementedError();
  }
}

export const deviceService: DeviceService = new NotImplementedDeviceService();
