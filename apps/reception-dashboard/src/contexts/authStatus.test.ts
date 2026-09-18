import { describe, it, expect } from "vitest";
import { deriveAuthStatus } from "./authStatus";

describe("deriveAuthStatus", () => {
  it("reports config_error when Supabase is not configured, regardless of other flags", () => {
    expect(deriveAuthStatus({ sessionLoading: false, configError: true, hasSession: true })).toBe(
      "config_error",
    );
  });

  it("reports loading while the initial session check is in flight", () => {
    expect(deriveAuthStatus({ sessionLoading: true, configError: false, hasSession: false })).toBe(
      "loading",
    );
  });

  it("reports unauthenticated once loaded with no session", () => {
    expect(deriveAuthStatus({ sessionLoading: false, configError: false, hasSession: false })).toBe(
      "unauthenticated",
    );
  });

  it("reports loading while the assurance-level check is still in flight (assuranceLevel undefined)", () => {
    expect(deriveAuthStatus({ sessionLoading: false, configError: false, hasSession: true })).toBe(
      "loading",
    );
  });

  it("fails closed to mfa_required when the assurance-level check could not be read (null)", () => {
    expect(
      deriveAuthStatus({
        sessionLoading: false,
        configError: false,
        hasSession: true,
        assuranceLevel: null,
      }),
    ).toBe("mfa_required");
  });

  it("reports mfa_required when password-authenticated but MFA is not yet verified (aal1)", () => {
    expect(
      deriveAuthStatus({
        sessionLoading: false,
        configError: false,
        hasSession: true,
        assuranceLevel: { currentLevel: "aal1", nextLevel: "aal2" },
      }),
    ).toBe("mfa_required");
  });

  it("reports mfa_required when MFA has never been enrolled (currentLevel === nextLevel === aal1) — mandatory-MFA policy, never treated as sufficient", () => {
    expect(
      deriveAuthStatus({
        sessionLoading: false,
        configError: false,
        hasSession: true,
        assuranceLevel: { currentLevel: "aal1", nextLevel: "aal1" },
      }),
    ).toBe("mfa_required");
  });

  it("reports authenticated only once the session has genuinely reached aal2", () => {
    expect(
      deriveAuthStatus({
        sessionLoading: false,
        configError: false,
        hasSession: true,
        assuranceLevel: { currentLevel: "aal2", nextLevel: "aal2" },
      }),
    ).toBe("authenticated");
  });
});
