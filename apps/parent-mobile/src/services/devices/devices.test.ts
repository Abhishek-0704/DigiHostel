import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit-level tests (mocked Supabase client) — complements
 * devices.integration.test.ts's real-RLS verification by covering error
 * classification and response-shape mapping that don't need a live
 * database.
 */

const fakeFrom = vi.fn();
vi.mock("../supabase/client", () => ({
  getSupabaseClient: () => ({ from: fakeFrom }),
}));

const fakeGetInstallationId = vi.fn();
vi.mock("../deviceIdentity/deviceIdentity", () => ({
  deviceIdentityService: { getInstallationId: () => fakeGetInstallationId() },
}));

// Imported AFTER the mocks are registered.
const { deviceService, DeviceServiceNotImplementedError } = await import("./devices");

function makeQueryBuilder(result: { data: unknown; error: unknown }) {
  const builder = {
    select: vi.fn(() => builder),
    is: vi.fn(() => builder),
    limit: vi.fn(() => Promise.resolve(result)),
    order: vi.fn(() => Promise.resolve(result)),
  };
  return builder;
}

describe("deviceService.hasActiveTrustedDevice", () => {
  beforeEach(() => {
    fakeFrom.mockReset();
  });

  it("returns true when at least one active row is returned", async () => {
    fakeFrom.mockReturnValue(makeQueryBuilder({ data: [{ id: "device-1" }], error: null }));
    await expect(deviceService.hasActiveTrustedDevice()).resolves.toBe(true);
    expect(fakeFrom).toHaveBeenCalledWith("trusted_devices");
  });

  it("returns false when the query succeeds with zero rows", async () => {
    fakeFrom.mockReturnValue(makeQueryBuilder({ data: [], error: null }));
    await expect(deviceService.hasActiveTrustedDevice()).resolves.toBe(false);
  });

  it("propagates a query error to the caller rather than silently returning false", async () => {
    const queryError = { message: "permission denied", code: "42501" };
    fakeFrom.mockReturnValue(makeQueryBuilder({ data: null, error: queryError }));
    await expect(deviceService.hasActiveTrustedDevice()).rejects.toBe(queryError);
  });
});

describe("deviceService.listTrustedDevices", () => {
  beforeEach(() => {
    fakeFrom.mockReset();
    fakeGetInstallationId.mockReset();
    fakeGetInstallationId.mockResolvedValue("this-installation-id");
  });

  it("maps an active row to TrustedDeviceSummary with null revocation fields", async () => {
    fakeFrom.mockReturnValue(
      makeQueryBuilder({
        data: [
          {
            id: "device-1",
            platform: "android",
            registered_at: "2026-01-01T00:00:00Z",
            revoked_at: null,
            revoked_reason: null,
            device_fingerprint: "some-other-installation-id",
          },
        ],
        error: null,
      }),
    );
    const result = await deviceService.listTrustedDevices();
    expect(result).toEqual([
      {
        id: "device-1",
        platform: "android",
        registeredAt: "2026-01-01T00:00:00Z",
        revokedAt: null,
        revokedReason: null,
        isCurrentDevice: false,
      },
    ]);
  });

  it("includes revoked rows (unlike hasActiveTrustedDevice) with their revocation fields populated", async () => {
    fakeFrom.mockReturnValue(
      makeQueryBuilder({
        data: [
          {
            id: "device-2",
            platform: "ios",
            registered_at: "2026-01-01T00:00:00Z",
            revoked_at: "2026-02-01T00:00:00Z",
            revoked_reason: "removed by user",
            device_fingerprint: "some-other-installation-id",
          },
        ],
        error: null,
      }),
    );
    const [device] = await deviceService.listTrustedDevices();
    expect(device.revokedAt).toBe("2026-02-01T00:00:00Z");
    expect(device.revokedReason).toBe("removed by user");
  });

  it("sets isCurrentDevice: true only when the row's device_fingerprint matches this installation's real id", async () => {
    fakeGetInstallationId.mockResolvedValue("matching-id");
    fakeFrom.mockReturnValue(
      makeQueryBuilder({
        data: [
          {
            id: "device-3",
            platform: "android",
            registered_at: "2026-01-01T00:00:00Z",
            revoked_at: null,
            revoked_reason: null,
            device_fingerprint: "matching-id",
          },
        ],
        error: null,
      }),
    );
    const [device] = await deviceService.listTrustedDevices();
    expect(device.isCurrentDevice).toBe(true);
  });

  it("never exposes device_fingerprint on the returned summary", async () => {
    fakeFrom.mockReturnValue(
      makeQueryBuilder({
        data: [
          {
            id: "device-4",
            platform: "android",
            registered_at: "2026-01-01T00:00:00Z",
            revoked_at: null,
            revoked_reason: null,
            device_fingerprint: "matching-id",
          },
        ],
        error: null,
      }),
    );
    const [device] = await deviceService.listTrustedDevices();
    expect(device).not.toHaveProperty("device_fingerprint");
    expect(device).not.toHaveProperty("deviceFingerprint");
  });
});

describe("deviceService.registerCurrentDevice / revokeDevice — fail-closed by design", () => {
  it("registerCurrentDevice always throws — never fabricates a trusted-device success (G-04)", async () => {
    await expect(deviceService.registerCurrentDevice()).rejects.toBeInstanceOf(
      DeviceServiceNotImplementedError,
    );
  });

  it("revokeDevice always throws — no backend removal endpoint exists yet", async () => {
    await expect(deviceService.revokeDevice("some-id")).rejects.toBeInstanceOf(
      DeviceServiceNotImplementedError,
    );
  });
});
