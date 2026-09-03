import { describe, it, expect } from "vitest";
import { deriveAuthStatus, type DeriveAuthStatusInput } from "./authStatus";

const BASE: DeriveAuthStatusInput = {
  sessionLoading: false,
  configError: false,
  hasSession: false,
  isAuthenticating: false,
  deviceCheck: { kind: "idle" },
  unexpectedSessionLoss: false,
};

describe("deriveAuthStatus", () => {
  it("configError takes precedence over everything else", () => {
    expect(deriveAuthStatus({ ...BASE, configError: true, sessionLoading: true })).toBe("error");
  });

  it("sessionLoading -> initializing", () => {
    expect(deriveAuthStatus({ ...BASE, sessionLoading: true })).toBe("initializing");
  });

  it("isAuthenticating -> authenticating, even with a session already present", () => {
    expect(deriveAuthStatus({ ...BASE, hasSession: true, isAuthenticating: true })).toBe(
      "authenticating",
    );
  });

  it("no session, no prior loss -> unauthenticated", () => {
    expect(deriveAuthStatus({ ...BASE, hasSession: false, unexpectedSessionLoss: false })).toBe(
      "unauthenticated",
    );
  });

  it("no session, unexpected loss flagged -> session_expired", () => {
    expect(deriveAuthStatus({ ...BASE, hasSession: false, unexpectedSessionLoss: true })).toBe(
      "session_expired",
    );
  });

  it.each([
    ["idle", "initializing"],
    ["loading", "initializing"],
    ["trusted", "authenticated"],
    ["untrusted", "device_verification_required"],
    ["network_error", "offline"],
    ["error", "error"],
  ] as const)("session present, deviceCheck=%s -> %s", (kind, expected) => {
    expect(deriveAuthStatus({ ...BASE, hasSession: true, deviceCheck: { kind } })).toBe(expected);
  });

  it("a session with unexpectedSessionLoss still set from a prior cycle does not itself force session_expired once hasSession is true again", () => {
    // Defensive: unexpectedSessionLoss should only matter when hasSession is false.
    const result = deriveAuthStatus({
      ...BASE,
      hasSession: true,
      unexpectedSessionLoss: true,
      deviceCheck: { kind: "trusted" },
    });
    expect(result).toBe("authenticated");
  });
});
