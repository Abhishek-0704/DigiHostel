import { describe, it, expect } from "vitest";
import { deriveSecurityRecommendations } from "./securityRecommendations";
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

describe("deriveSecurityRecommendations", () => {
  it("recommends enabling biometrics only when capable AND not already enabled", () => {
    const recs = deriveSecurityRecommendations({
      biometricCapable: true,
      biometricEnabled: false,
      devices: [device()],
    });
    expect(recs.some((r) => r.id === "enable-biometric")).toBe(true);
  });

  it("does not recommend enabling biometrics when already enabled", () => {
    const recs = deriveSecurityRecommendations({
      biometricCapable: true,
      biometricEnabled: true,
      devices: [device()],
    });
    expect(recs.some((r) => r.id === "enable-biometric")).toBe(false);
  });

  it("does not recommend enabling biometrics when the device isn't capable at all", () => {
    const recs = deriveSecurityRecommendations({
      biometricCapable: false,
      biometricEnabled: false,
      devices: [device()],
    });
    expect(recs.some((r) => r.id === "enable-biometric")).toBe(false);
  });

  it("recommends verifying a device when there are zero active devices", () => {
    const recs = deriveSecurityRecommendations({
      biometricCapable: false,
      biometricEnabled: false,
      devices: [],
    });
    expect(recs.some((r) => r.id === "verify-a-device")).toBe(true);
  });

  it("does not recommend verifying a device when at least one active device exists", () => {
    const recs = deriveSecurityRecommendations({
      biometricCapable: false,
      biometricEnabled: false,
      devices: [device({ revokedAt: null })],
    });
    expect(recs.some((r) => r.id === "verify-a-device")).toBe(false);
  });

  it("recommends reviewing device history only when a revoked device exists, with correct singular/plural wording", () => {
    const oneRevoked = deriveSecurityRecommendations({
      biometricCapable: false,
      biometricEnabled: false,
      devices: [device({ revokedAt: "2026-02-01T00:00:00Z" })],
    });
    const rec = oneRevoked.find((r) => r.id === "review-device-history");
    expect(rec?.description).toContain("1 removed device on record");

    const twoRevoked = deriveSecurityRecommendations({
      biometricCapable: false,
      biometricEnabled: false,
      devices: [
        device({ id: "a", revokedAt: "2026-02-01T00:00:00Z" }),
        device({ id: "b", revokedAt: "2026-02-02T00:00:00Z" }),
      ],
    });
    expect(twoRevoked.find((r) => r.id === "review-device-history")?.description).toContain(
      "2 removed devices on record",
    );
  });

  it("returns an empty array when nothing warrants a recommendation", () => {
    const recs = deriveSecurityRecommendations({
      biometricCapable: true,
      biometricEnabled: true,
      devices: [device({ revokedAt: null })],
    });
    expect(recs).toEqual([]);
  });

  it("never implies a backend check that doesn't exist (no mention of a security score or attestation)", () => {
    const recs = deriveSecurityRecommendations({
      biometricCapable: true,
      biometricEnabled: false,
      devices: [],
    });
    const text = recs
      .map((r) => `${r.title} ${r.description}`)
      .join(" ")
      .toLowerCase();
    expect(text).not.toContain("security score");
    expect(text).not.toContain("attestation");
  });
});
