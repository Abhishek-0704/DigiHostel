import { describe, it, expect, vi } from "vitest";
import {
  orchestrateAndroidDeviceRegistration,
  DeviceAttestationNotConfiguredError,
  type RegisterDeviceOrchestrationDeps,
} from "./registerDeviceOrchestration";

function buildDeps(overrides: Partial<RegisterDeviceOrchestrationDeps> = {}) {
  const requestChallenge = vi.fn().mockResolvedValue({
    challengeId: "challenge-1",
    nonce: "server-issued-nonce",
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
  });
  const requestIntegrityToken = vi.fn().mockResolvedValue("real-integrity-token");
  const submitRegistration = vi.fn().mockResolvedValue({
    id: "device-1",
    platform: "android",
    registeredAt: new Date().toISOString(),
  });
  const getInstallationId = vi.fn().mockResolvedValue("installation-id-1");
  const getCloudProjectNumber = vi.fn().mockReturnValue("123456789");

  return {
    deps: {
      requestChallenge,
      requestIntegrityToken,
      submitRegistration,
      getInstallationId,
      getCloudProjectNumber,
      ...overrides,
    } as RegisterDeviceOrchestrationDeps,
    requestChallenge,
    requestIntegrityToken,
    submitRegistration,
    getInstallationId,
    getCloudProjectNumber,
  };
}

describe("orchestrateAndroidDeviceRegistration", () => {
  it("happy path: challenge -> native attestation bound to that exact nonce -> registration submitted with that exact token/fingerprint", async () => {
    const { deps, requestIntegrityToken, submitRegistration } = buildDeps();

    const result = await orchestrateAndroidDeviceRegistration(deps);

    expect(requestIntegrityToken).toHaveBeenCalledWith("server-issued-nonce", "123456789");
    expect(submitRegistration).toHaveBeenCalledWith({
      challengeId: "challenge-1",
      platform: "android",
      attestationToken: "real-integrity-token",
      deviceFingerprint: "installation-id-1",
    });
    expect(result).toEqual({
      id: "device-1",
      platform: "android",
      registeredAt: expect.any(String),
    });
  });

  it("throws DeviceAttestationNotConfiguredError when no cloud project number is configured — never proceeds to a native call", async () => {
    const { deps, requestChallenge, requestIntegrityToken, submitRegistration } = buildDeps({
      getCloudProjectNumber: vi.fn().mockReturnValue(null),
    });

    await expect(orchestrateAndroidDeviceRegistration(deps)).rejects.toBeInstanceOf(
      DeviceAttestationNotConfiguredError,
    );
    expect(requestChallenge).not.toHaveBeenCalled();
    expect(requestIntegrityToken).not.toHaveBeenCalled();
    expect(submitRegistration).not.toHaveBeenCalled();
  });

  it("a challenge-request failure propagates — the native attestation call never runs without a real server nonce", async () => {
    const { deps, requestIntegrityToken, submitRegistration } = buildDeps({
      requestChallenge: vi.fn().mockRejectedValue(new Error("network down")),
    });

    await expect(orchestrateAndroidDeviceRegistration(deps)).rejects.toThrow("network down");
    expect(requestIntegrityToken).not.toHaveBeenCalled();
    expect(submitRegistration).not.toHaveBeenCalled();
  });

  it("a native attestation failure propagates — registration is never submitted without a real token", async () => {
    const { deps, submitRegistration } = buildDeps({
      requestIntegrityToken: vi.fn().mockRejectedValue(new Error("Play services unavailable")),
    });

    await expect(orchestrateAndroidDeviceRegistration(deps)).rejects.toThrow(
      "Play services unavailable",
    );
    expect(submitRegistration).not.toHaveBeenCalled();
  });

  it("a backend rejection (e.g. attestation_rejected) propagates as a real error, never as a fabricated success", async () => {
    const { deps } = buildDeps({
      submitRegistration: vi.fn().mockRejectedValue(new Error("attestation_rejected")),
    });

    await expect(orchestrateAndroidDeviceRegistration(deps)).rejects.toThrow(
      "attestation_rejected",
    );
  });

  it("never calls submitRegistration with a locally-fabricated device id/platform — always exactly what the backend returns", async () => {
    const backendDevice = {
      id: "backend-assigned-id",
      platform: "android" as const,
      registeredAt: "2026-01-01T00:00:00Z",
    };
    const { deps } = buildDeps({
      submitRegistration: vi.fn().mockResolvedValue(backendDevice),
    });

    const result = await orchestrateAndroidDeviceRegistration(deps);

    expect(result).toBe(backendDevice);
  });
});
