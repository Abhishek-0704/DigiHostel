import { describe, it, expect } from "vitest";
import { deriveProtectionSummary } from "./securityStatus";

describe("deriveProtectionSummary", () => {
  it("warns when there is no active trusted device, regardless of biometric state", () => {
    const summary = deriveProtectionSummary({
      hasActiveTrustedDevice: false,
      biometricEnabled: true,
    });
    expect(summary.tone).toBe("warning");
  });

  it("reports 'protection checks in place' only when both trusted device AND biometric are true", () => {
    const summary = deriveProtectionSummary({
      hasActiveTrustedDevice: true,
      biometricEnabled: true,
    });
    expect(summary.tone).toBe("success");
    expect(summary.label).toBe("Protection checks in place");
  });

  it("reports 'basic protection active' when trusted but biometric is off", () => {
    const summary = deriveProtectionSummary({
      hasActiveTrustedDevice: true,
      biometricEnabled: false,
    });
    expect(summary.tone).toBe("neutral");
  });

  it("never claims the account is 'completely' or 'fully' secure", () => {
    const combinations = [
      { hasActiveTrustedDevice: true, biometricEnabled: true },
      { hasActiveTrustedDevice: true, biometricEnabled: false },
      { hasActiveTrustedDevice: false, biometricEnabled: false },
      { hasActiveTrustedDevice: false, biometricEnabled: true },
    ];
    for (const input of combinations) {
      const summary = deriveProtectionSummary(input);
      const text = `${summary.label} ${summary.description}`.toLowerCase();
      expect(text).not.toContain("completely secure");
      expect(text).not.toContain("fully secure");
      expect(text).not.toContain("100%");
    }
  });

  it("every summary carries a non-empty label and description", () => {
    const summary = deriveProtectionSummary({
      hasActiveTrustedDevice: true,
      biometricEnabled: true,
    });
    expect(summary.label.length).toBeGreaterThan(0);
    expect(summary.description.length).toBeGreaterThan(0);
  });
});
