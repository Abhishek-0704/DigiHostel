import { describe, it, expect } from "vitest";
import { biometricResultMessage } from "./biometricMessages";
import type { BiometricResultKind } from "../../services/biometric/biometric";

const ALL_NON_SUCCESS_KINDS: Exclude<BiometricResultKind, "success">[] = [
  "user_cancelled",
  "authentication_failed",
  "temporary_lockout",
  "permanent_lockout",
  "not_enrolled",
  "hardware_unavailable",
  "not_supported",
  "system_cancelled",
  "timeout",
  "device_credential_required",
  "unknown_error",
];

describe("biometricResultMessage", () => {
  it.each(ALL_NON_SUCCESS_KINDS)("returns a non-empty title and description for '%s'", (kind) => {
    const message = biometricResultMessage(kind);
    expect(message.title.length).toBeGreaterThan(0);
    expect(message.description.length).toBeGreaterThan(0);
  });

  it("not_enrolled and permanent_lockout both suggest device settings", () => {
    expect(biometricResultMessage("not_enrolled").suggestDeviceSettings).toBe(true);
    expect(biometricResultMessage("permanent_lockout").suggestDeviceSettings).toBe(true);
  });

  it("not_supported cannot be retried and does not suggest device settings (nothing to configure)", () => {
    const message = biometricResultMessage("not_supported");
    expect(message.canRetry).toBe(false);
    expect(message.suggestDeviceSettings).toBe(false);
  });

  it("never claims DigiHostel itself verified biometric data", () => {
    for (const kind of ALL_NON_SUCCESS_KINDS) {
      const { title, description } = biometricResultMessage(kind);
      const text = `${title} ${description}`.toLowerCase();
      expect(text).not.toContain("digihostel verified");
      expect(text).not.toContain("your fingerprint is stored");
      expect(text).not.toContain("your face was verified by");
    }
  });
});
