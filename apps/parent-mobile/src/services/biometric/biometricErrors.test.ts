import { describe, it, expect } from "vitest";
import { mapPlatformAuthError } from "./biometricErrors";
import type { LocalAuthenticationError } from "expo-local-authentication";

describe("mapPlatformAuthError", () => {
  it.each([
    ["not_enrolled", "not_enrolled"],
    ["passcode_not_set", "not_enrolled"],
    ["user_cancel", "user_cancelled"],
    ["app_cancel", "system_cancelled"],
    ["system_cancel", "system_cancelled"],
    ["invalid_context", "system_cancelled"],
    ["not_available", "hardware_unavailable"],
    ["lockout", "temporary_lockout"],
    ["timeout", "timeout"],
    ["user_fallback", "device_credential_required"],
    ["unable_to_process", "authentication_failed"],
    ["authentication_failed", "authentication_failed"],
    ["no_space", "unknown_error"],
    ["unknown", "unknown_error"],
  ] as const satisfies readonly [LocalAuthenticationError, string][])(
    "maps platform error '%s' to '%s'",
    (platformError, expectedKind) => {
      expect(mapPlatformAuthError(platformError)).toBe(expectedKind);
    },
  );

  it("never produces 'permanent_lockout' — the platform library does not expose that distinction, so this mapper must not fabricate it", () => {
    const allErrors: LocalAuthenticationError[] = [
      "not_enrolled",
      "user_cancel",
      "app_cancel",
      "not_available",
      "lockout",
      "no_space",
      "timeout",
      "unable_to_process",
      "unknown",
      "system_cancel",
      "user_fallback",
      "invalid_context",
      "passcode_not_set",
      "authentication_failed",
    ];
    for (const err of allErrors) {
      expect(mapPlatformAuthError(err)).not.toBe("permanent_lockout");
    }
  });
});
