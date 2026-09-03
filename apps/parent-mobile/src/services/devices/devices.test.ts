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

// Imported AFTER the mock is registered.
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
  });

  it("maps rows to TrustedDeviceSummary, always with isCurrentDevice: false (no registration flow exists yet to ever set it true)", async () => {
    fakeFrom.mockReturnValue(
      makeQueryBuilder({
        data: [{ id: "device-1", platform: "android", registered_at: "2026-01-01T00:00:00Z" }],
        error: null,
      }),
    );
    const result = await deviceService.listTrustedDevices();
    expect(result).toEqual([
      {
        id: "device-1",
        platform: "android",
        registeredAt: "2026-01-01T00:00:00Z",
        isCurrentDevice: false,
      },
    ]);
  });
});

describe("deviceService.registerCurrentDevice / revokeDevice — fail-closed by design", () => {
  it("registerCurrentDevice always throws — never fabricates a trusted-device success (G-04)", async () => {
    await expect(deviceService.registerCurrentDevice()).rejects.toBeInstanceOf(
      DeviceServiceNotImplementedError,
    );
  });

  it("revokeDevice always throws — deferred to Prompt 6, not attempted here", async () => {
    await expect(deviceService.revokeDevice("some-id")).rejects.toBeInstanceOf(
      DeviceServiceNotImplementedError,
    );
  });
});
