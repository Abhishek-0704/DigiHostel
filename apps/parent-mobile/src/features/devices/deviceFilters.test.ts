import { describe, it, expect } from "vitest";
import { filterDevices, sortDevices } from "./deviceFilters";
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

describe("filterDevices", () => {
  const devices = [
    device({ id: "active-android", platform: "android", revokedAt: null }),
    device({ id: "revoked-ios", platform: "ios", revokedAt: "2026-02-01T00:00:00Z" }),
  ];

  it("returns everything with no options", () => {
    expect(filterDevices(devices)).toHaveLength(2);
  });

  it("filters to active only", () => {
    const result = filterDevices(devices, { status: "active" });
    expect(result.map((d) => d.id)).toEqual(["active-android"]);
  });

  it("filters to revoked only", () => {
    const result = filterDevices(devices, { status: "revoked" });
    expect(result.map((d) => d.id)).toEqual(["revoked-ios"]);
  });

  it("filters by platform", () => {
    const result = filterDevices(devices, { platform: "ios" });
    expect(result.map((d) => d.id)).toEqual(["revoked-ios"]);
  });

  it("combines status and platform filters", () => {
    const result = filterDevices(devices, { status: "active", platform: "ios" });
    expect(result).toEqual([]);
  });
});

describe("sortDevices", () => {
  const older = device({ id: "older", registeredAt: "2026-01-01T00:00:00Z" });
  const newer = device({ id: "newer", registeredAt: "2026-02-01T00:00:00Z" });
  const current = device({
    id: "current",
    registeredAt: "2026-01-15T00:00:00Z",
    isCurrentDevice: true,
  });

  it("sorts newest-registered first", () => {
    const result = sortDevices([older, newer], "registered-desc");
    expect(result.map((d) => d.id)).toEqual(["newer", "older"]);
  });

  it("sorts oldest-registered first", () => {
    const result = sortDevices([newer, older], "registered-asc");
    expect(result.map((d) => d.id)).toEqual(["older", "newer"]);
  });

  it("sorts the current device first", () => {
    const result = sortDevices([older, current, newer], "current-first");
    expect(result[0].id).toBe("current");
  });

  it("never mutates the input array", () => {
    const original = [older, newer];
    const originalCopy = [...original];
    sortDevices(original, "registered-desc");
    expect(original).toEqual(originalCopy);
  });
});
