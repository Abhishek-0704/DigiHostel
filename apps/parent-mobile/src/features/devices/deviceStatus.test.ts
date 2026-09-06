import { describe, it, expect } from "vitest";
import { getDeviceTrustState, canRemoveDevice, canReplaceDevice } from "./deviceStatus";
import type { TrustedDeviceSummary } from "../../services/devices/devices";

function device(overrides: Partial<TrustedDeviceSummary> = {}): TrustedDeviceSummary {
  return {
    id: "device-1",
    platform: "android",
    registeredAt: "2026-01-01T00:00:00Z",
    revokedAt: null,
    revokedReason: null,
    isCurrentDevice: false,
    ...overrides,
  };
}

describe("getDeviceTrustState", () => {
  it("returns 'active' when revokedAt is null", () => {
    expect(getDeviceTrustState(device({ revokedAt: null }))).toBe("active");
  });

  it("returns 'revoked' when revokedAt is set", () => {
    expect(getDeviceTrustState(device({ revokedAt: "2026-02-01T00:00:00Z" }))).toBe("revoked");
  });
});

describe("canRemoveDevice", () => {
  it("allows removal of an active device", () => {
    expect(canRemoveDevice(device({ revokedAt: null }))).toBe(true);
  });

  it("does not allow removal of an already-revoked device — nothing left to remove", () => {
    expect(canRemoveDevice(device({ revokedAt: "2026-02-01T00:00:00Z" }))).toBe(false);
  });
});

describe("canReplaceDevice", () => {
  it("allows replacement of an active device", () => {
    expect(canReplaceDevice(device({ revokedAt: null }))).toBe(true);
  });

  it("does not allow replacement of an already-revoked device", () => {
    expect(canReplaceDevice(device({ revokedAt: "2026-02-01T00:00:00Z" }))).toBe(false);
  });
});
