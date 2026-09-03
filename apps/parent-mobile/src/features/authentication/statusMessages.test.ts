import { describe, it, expect } from "vitest";
import { splashStatusMessage } from "./statusMessages";
import type { AuthStatus } from "../../contexts/authStatus";

describe("splashStatusMessage", () => {
  it.each([
    ["initializing", "Restoring"],
    ["authenticating", "Signing you in"],
    ["device_verification_required", "device"],
    ["session_expired", "expired"],
    ["authenticated", "Welcome back"],
  ] as const)("status=%s returns a message mentioning '%s'", (status, expectedFragment) => {
    expect(splashStatusMessage(status)).toContain(expectedFragment);
  });

  it.each(["unauthenticated", "offline", "error"] as const)(
    "status=%s returns an empty string — those states render their own dedicated UI, not this status line",
    (status) => {
      expect(splashStatusMessage(status)).toBe("");
    },
  );

  it("every AuthStatus value is handled (exhaustiveness — a new status added to the type would fail this)", () => {
    const allStatuses: AuthStatus[] = [
      "initializing",
      "unauthenticated",
      "authenticating",
      "authenticated",
      "device_verification_required",
      "session_expired",
      "offline",
      "error",
    ];
    for (const status of allStatuses) {
      expect(() => splashStatusMessage(status)).not.toThrow();
      expect(typeof splashStatusMessage(status)).toBe("string");
    }
  });
});
