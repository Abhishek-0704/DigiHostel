import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit-level tests (mocked Supabase client) — complements
 * devices.integration.test.ts's real-RLS verification by covering error
 * classification and response-shape mapping that don't need a live
 * database. ADR-003 implementation: registerCurrentDevice() now touches
 * `react-native` (Platform), the native Play Integrity module, and the
 * generated API client directly — all mocked below so this file stays a
 * plain-Node unit test with no real native/network dependency, matching
 * `registerDeviceOrchestration.test.ts`'s own coverage of the actual
 * sequencing logic (this file only needs to prove devices.ts wires the real
 * pieces together correctly, not re-prove the orchestration itself).
 */

const fakeFrom = vi.fn();
vi.mock("../supabase/client", () => ({
  getSupabaseClient: () => ({ from: fakeFrom }),
}));

const fakeGetInstallationId = vi.fn();
vi.mock("../deviceIdentity/deviceIdentity", () => ({
  deviceIdentityService: { getInstallationId: () => fakeGetInstallationId() },
}));

let platformOS: "android" | "ios" = "android";
vi.mock("react-native", () => ({
  get Platform() {
    return { OS: platformOS };
  },
}));

const fakeGetGoogleCloudProjectNumber = vi.fn();
vi.mock("../../config/env", () => ({
  getGoogleCloudProjectNumber: () => fakeGetGoogleCloudProjectNumber(),
}));

const fakeRequestIntegrityToken = vi.fn();
vi.mock("../../../modules/play-integrity/src/DigihostelPlayIntegrityModule", () => ({
  default: { requestIntegrityToken: (...args: unknown[]) => fakeRequestIntegrityToken(...args) },
}));

const fakeRequestDeviceChallenge = vi.fn();
const fakeRegisterDevice = vi.fn();
vi.mock("@digihostel/api-client-react", () => ({
  requestDeviceChallenge: (...args: unknown[]) => fakeRequestDeviceChallenge(...args),
  registerDevice: (...args: unknown[]) => fakeRegisterDevice(...args),
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

describe("deviceService.registerCurrentDevice — ADR-003 implementation", () => {
  beforeEach(() => {
    platformOS = "android";
    fakeGetGoogleCloudProjectNumber.mockReset();
    fakeGetInstallationId.mockReset();
    fakeRequestIntegrityToken.mockReset();
    fakeRequestDeviceChallenge.mockReset();
    fakeRegisterDevice.mockReset();
  });

  it("iOS: throws DeviceServiceNotImplementedError — App Attest is a separate, not-yet-implemented integration", async () => {
    platformOS = "ios";

    await expect(deviceService.registerCurrentDevice()).rejects.toBeInstanceOf(
      DeviceServiceNotImplementedError,
    );
    expect(fakeRequestDeviceChallenge).not.toHaveBeenCalled();
  });

  it("Android, no cloud project number configured: throws DeviceServiceNotImplementedError, never attempts a native call", async () => {
    fakeGetGoogleCloudProjectNumber.mockReturnValue(null);

    await expect(deviceService.registerCurrentDevice()).rejects.toBeInstanceOf(
      DeviceServiceNotImplementedError,
    );
    expect(fakeRequestIntegrityToken).not.toHaveBeenCalled();
  });

  it("Android, real flow: challenge -> native attestation -> registration, in order, with the real values threaded through", async () => {
    fakeGetGoogleCloudProjectNumber.mockReturnValue("123456789");
    fakeGetInstallationId.mockResolvedValue("this-installation-id");
    fakeRequestDeviceChallenge.mockResolvedValue({
      challengeId: "challenge-1",
      nonce: "server-nonce",
      expiresAt: "2026-01-01T00:05:00Z",
    });
    fakeRequestIntegrityToken.mockResolvedValue("real-integrity-token");
    fakeRegisterDevice.mockResolvedValue({
      id: "device-1",
      platform: "android",
      registeredAt: "2026-01-01T00:00:00Z",
    });

    const result = await deviceService.registerCurrentDevice();

    expect(fakeRequestDeviceChallenge).toHaveBeenCalledWith({ platform: "android" });
    expect(fakeRequestIntegrityToken).toHaveBeenCalledWith("server-nonce", "123456789");
    expect(fakeRegisterDevice).toHaveBeenCalledWith({
      challengeId: "challenge-1",
      platform: "android",
      attestationToken: "real-integrity-token",
      deviceFingerprint: "this-installation-id",
    });
    expect(result).toEqual({
      id: "device-1",
      platform: "android",
      registeredAt: "2026-01-01T00:00:00Z",
      revokedAt: null,
      revokedReason: null,
      isCurrentDevice: true,
    });
  });

  it("Android, backend rejects the attestation: the real rejection error propagates, never a fabricated success", async () => {
    fakeGetGoogleCloudProjectNumber.mockReturnValue("123456789");
    fakeGetInstallationId.mockResolvedValue("this-installation-id");
    fakeRequestDeviceChallenge.mockResolvedValue({
      challengeId: "challenge-1",
      nonce: "server-nonce",
      expiresAt: "2026-01-01T00:05:00Z",
    });
    fakeRequestIntegrityToken.mockResolvedValue("real-integrity-token");
    fakeRegisterDevice.mockRejectedValue(new Error("attestation_rejected"));

    await expect(deviceService.registerCurrentDevice()).rejects.toThrow("attestation_rejected");
  });

  it("Android, native Play Integrity call fails: propagates, never falls back to a locally-declared trust state", async () => {
    fakeGetGoogleCloudProjectNumber.mockReturnValue("123456789");
    fakeGetInstallationId.mockResolvedValue("this-installation-id");
    fakeRequestDeviceChallenge.mockResolvedValue({
      challengeId: "challenge-1",
      nonce: "server-nonce",
      expiresAt: "2026-01-01T00:05:00Z",
    });
    fakeRequestIntegrityToken.mockRejectedValue(new Error("Play services unavailable"));

    await expect(deviceService.registerCurrentDevice()).rejects.toThrow(
      "Play services unavailable",
    );
    expect(fakeRegisterDevice).not.toHaveBeenCalled();
  });
});

describe("deviceService.revokeDevice — fail-closed by design", () => {
  it("revokeDevice always throws — no backend removal endpoint exists yet", async () => {
    await expect(deviceService.revokeDevice("some-id")).rejects.toBeInstanceOf(
      DeviceServiceNotImplementedError,
    );
  });
});
