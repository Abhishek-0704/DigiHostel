import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit-level tests (mocked `expo-local-authentication`, `expo-crypto`, and
 * `react-native`) — `biometric.ts` directly imports `Platform` from
 * `react-native`, which is not parseable under a plain Vitest/Node run (the
 * same issue `devices.test.ts` worked around by mocking `deviceIdentity`'s
 * own `react-native` import) — mocking the module here directly sidesteps
 * it the same way.
 */

const mockPlatform = { OS: "android" as "android" | "ios" };
vi.mock("react-native", () => ({ Platform: mockPlatform }));

const hasHardwareAsync = vi.fn();
const isEnrolledAsync = vi.fn();
const supportedAuthenticationTypesAsync = vi.fn();
const getEnrolledLevelAsync = vi.fn();
const authenticateAsync = vi.fn();
const cancelAuthenticate = vi.fn();

vi.mock("expo-local-authentication", () => ({
  hasHardwareAsync: (...args: unknown[]) => hasHardwareAsync(...args),
  isEnrolledAsync: (...args: unknown[]) => isEnrolledAsync(...args),
  supportedAuthenticationTypesAsync: (...args: unknown[]) =>
    supportedAuthenticationTypesAsync(...args),
  getEnrolledLevelAsync: (...args: unknown[]) => getEnrolledLevelAsync(...args),
  authenticateAsync: (...args: unknown[]) => authenticateAsync(...args),
  cancelAuthenticate: (...args: unknown[]) => cancelAuthenticate(...args),
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
}));

let uuidCounter = 0;
vi.mock("expo-crypto", () => ({
  randomUUID: () => `fake-uuid-${++uuidCounter}`,
}));

const { biometricService } = await import("./biometric");

function mockCapabilities(overrides: {
  hardwareAvailable?: boolean;
  enrolled?: boolean;
  types?: number[];
  level?: number;
}) {
  hasHardwareAsync.mockResolvedValue(overrides.hardwareAvailable ?? true);
  isEnrolledAsync.mockResolvedValue(overrides.enrolled ?? true);
  supportedAuthenticationTypesAsync.mockResolvedValue(overrides.types ?? [1]);
  getEnrolledLevelAsync.mockResolvedValue(overrides.level ?? 3);
}

beforeEach(() => {
  vi.clearAllMocks();
  uuidCounter = 0;
  mockPlatform.OS = "android";
});

describe("biometricService.getCapabilities", () => {
  it("maps a fully-available strong-biometric device correctly", async () => {
    mockCapabilities({ hardwareAvailable: true, enrolled: true, types: [1, 2], level: 3 });
    const capabilities = await biometricService.getCapabilities();
    expect(capabilities).toEqual({
      hardwareAvailable: true,
      enrolled: true,
      supportedMethods: ["fingerprint", "facial"],
      securityLevel: "biometric_strong",
      deviceCredentialAvailable: true,
    });
  });

  it("reports hardware unavailable and enrolled: false honestly, never inferring one from the other", async () => {
    mockCapabilities({ hardwareAvailable: false, enrolled: false, types: [], level: 0 });
    const capabilities = await biometricService.getCapabilities();
    expect(capabilities.hardwareAvailable).toBe(false);
    expect(capabilities.enrolled).toBe(false);
    expect(capabilities.securityLevel).toBe("none");
    expect(capabilities.deviceCredentialAvailable).toBe(false);
  });

  it("device_credential is available when only a PIN/pattern is enrolled (SECRET level), with no biometric method", async () => {
    mockCapabilities({ hardwareAvailable: false, enrolled: true, types: [], level: 1 });
    const capabilities = await biometricService.getCapabilities();
    expect(capabilities.securityLevel).toBe("device_credential");
    expect(capabilities.deviceCredentialAvailable).toBe(true);
    expect(capabilities.supportedMethods).toEqual([]);
  });

  it("fails closed (all-unavailable) if the native module throws unexpectedly", async () => {
    hasHardwareAsync.mockRejectedValue(new Error("native module crashed"));
    isEnrolledAsync.mockResolvedValue(true);
    supportedAuthenticationTypesAsync.mockResolvedValue([1]);
    getEnrolledLevelAsync.mockResolvedValue(3);
    const capabilities = await biometricService.getCapabilities();
    expect(capabilities.hardwareAvailable).toBe(false);
    expect(capabilities.enrolled).toBe(false);
  });
});

describe("biometricService.authenticate", () => {
  it("returns 'not_supported' and never calls the native prompt when hardware is unavailable", async () => {
    mockCapabilities({ hardwareAvailable: false });
    const result = await biometricService.authenticate("Confirm it's you");
    expect(result).toEqual({ kind: "not_supported" });
    expect(authenticateAsync).not.toHaveBeenCalled();
  });

  it("returns 'not_enrolled' and never calls the native prompt when nothing is enrolled", async () => {
    mockCapabilities({ hardwareAvailable: true, enrolled: false });
    const result = await biometricService.authenticate("Confirm it's you");
    expect(result).toEqual({ kind: "not_enrolled" });
    expect(authenticateAsync).not.toHaveBeenCalled();
  });

  it("returns 'success' on a real platform success", async () => {
    mockCapabilities({});
    authenticateAsync.mockResolvedValue({ success: true });
    const result = await biometricService.authenticate("Confirm it's you");
    expect(result).toEqual({ kind: "success" });
  });

  it("maps a platform failure through mapPlatformAuthError, never inventing success", async () => {
    mockCapabilities({});
    authenticateAsync.mockResolvedValue({ success: false, error: "lockout" });
    const result = await biometricService.authenticate("Confirm it's you");
    expect(result).toEqual({ kind: "temporary_lockout" });
  });

  it("requests strong biometric security level and does not disable device-credential fallback", async () => {
    mockCapabilities({});
    authenticateAsync.mockResolvedValue({ success: true });
    await biometricService.authenticate("Confirm it's you");
    expect(authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        promptMessage: "Confirm it's you",
        biometricsSecurityLevel: "strong",
        disableDeviceFallback: false,
      }),
    );
  });

  it("resolves with 'unknown_error' rather than throwing/crashing if the native call itself rejects", async () => {
    mockCapabilities({});
    authenticateAsync.mockRejectedValue(new Error("native crash"));
    const result = await biometricService.authenticate("Confirm it's you");
    expect(result).toEqual({ kind: "unknown_error" });
  });
});

describe("biometricService.createAssertion — security boundary", () => {
  it("on success, produces an assertion bound to the given actionId with a fresh token", async () => {
    mockCapabilities({});
    authenticateAsync.mockResolvedValue({ success: true });
    const result = await biometricService.createAssertion("leave-request-42:approve", "Confirm");
    expect(result).toEqual({
      kind: "success",
      assertion: { assertionToken: "fake-uuid-1", actionId: "leave-request-42:approve" },
    });
  });

  it("never produces an assertion when the underlying authentication did not succeed", async () => {
    mockCapabilities({});
    authenticateAsync.mockResolvedValue({ success: false, error: "user_cancel" });
    const result = await biometricService.createAssertion("leave-request-42:approve", "Confirm");
    expect(result).toEqual({ kind: "user_cancelled" });
    expect(result).not.toHaveProperty("assertion");
  });

  it("never produces an assertion when hardware/enrollment checks fail, even before any native prompt runs", async () => {
    mockCapabilities({ hardwareAvailable: false });
    const result = await biometricService.createAssertion("device-123:remove", "Confirm");
    expect(result).toEqual({ kind: "not_supported" });
    expect(authenticateAsync).not.toHaveBeenCalled();
  });

  it("each successful assertion gets a distinct token — never a reused/hardcoded value", async () => {
    mockCapabilities({});
    authenticateAsync.mockResolvedValue({ success: true });
    const first = await biometricService.createAssertion("action-a", "Confirm");
    const second = await biometricService.createAssertion("action-b", "Confirm");
    expect(first.kind).toBe("success");
    expect(second.kind).toBe("success");
    if (first.kind === "success" && second.kind === "success") {
      expect(first.assertion.assertionToken).not.toBe(second.assertion.assertionToken);
    }
  });
});

describe("biometricService.cancelAuthentication", () => {
  it("calls the native cancel on Android", async () => {
    mockPlatform.OS = "android";
    await biometricService.cancelAuthentication();
    expect(cancelAuthenticate).toHaveBeenCalledTimes(1);
  });

  it("no-ops on iOS rather than calling an Android-only native method", async () => {
    mockPlatform.OS = "ios";
    await biometricService.cancelAuthentication();
    expect(cancelAuthenticate).not.toHaveBeenCalled();
  });

  it("swallows a native rejection rather than throwing to the caller", async () => {
    mockPlatform.OS = "android";
    cancelAuthenticate.mockRejectedValue(new Error("nothing to cancel"));
    await expect(biometricService.cancelAuthentication()).resolves.toBeUndefined();
  });
});
