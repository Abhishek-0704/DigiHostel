import { describe, it, expect } from "vitest";
import { describeMethod, describeMethods, canAuthenticate } from "./biometricCapability";
import type { BiometricCapabilities } from "../../services/biometric/biometric";

function capabilities(overrides: Partial<BiometricCapabilities> = {}): BiometricCapabilities {
  return {
    hardwareAvailable: true,
    enrolled: true,
    supportedMethods: ["fingerprint"],
    securityLevel: "biometric_strong",
    deviceCredentialAvailable: true,
    ...overrides,
  };
}

describe("describeMethod", () => {
  it.each([
    ["fingerprint", "Fingerprint"],
    ["facial", "Face recognition"],
    ["iris", "Iris recognition"],
  ] as const)("labels %s as %s", (method, label) => {
    expect(describeMethod(method)).toBe(label);
  });
});

describe("describeMethods", () => {
  it("returns an empty string for no methods, never a fabricated label", () => {
    expect(describeMethods([])).toBe("");
  });

  it("returns the single label unjoined for one method", () => {
    expect(describeMethods(["fingerprint"])).toBe("Fingerprint");
  });

  it("joins two methods with 'and'", () => {
    expect(describeMethods(["fingerprint", "facial"])).toBe("Fingerprint and Face recognition");
  });

  it("comma-joins three or more methods with a trailing 'and'", () => {
    expect(describeMethods(["fingerprint", "facial", "iris"])).toBe(
      "Fingerprint, Face recognition and Iris recognition",
    );
  });
});

describe("canAuthenticate", () => {
  it("true when hardware available and enrolled", () => {
    expect(canAuthenticate(capabilities({ hardwareAvailable: true, enrolled: true }))).toBe(true);
  });

  it("false when hardware unavailable, even if enrolled is somehow true", () => {
    expect(canAuthenticate(capabilities({ hardwareAvailable: false, enrolled: true }))).toBe(false);
  });

  it("false when hardware available but not enrolled — never infers enrollment from hardware", () => {
    expect(canAuthenticate(capabilities({ hardwareAvailable: true, enrolled: false }))).toBe(false);
  });
});
