import { describe, it, expect } from "vitest";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { mapAuthError } from "./authErrors";
import { AppError } from "../../lib/errors/errors";

describe("mapAuthError", () => {
  it("passes an existing AppError through unchanged", () => {
    const original = new AppError("network", "already mapped");
    expect(mapAuthError(original)).toBe(original);
  });

  it("classifies a retryable fetch error as network", () => {
    const err = new AuthRetryableFetchError("fetch failed", 0);
    expect(mapAuthError(err).kind).toBe("network");
  });

  it("classifies invalid_credentials correctly, without leaking Supabase's own message", () => {
    const err = new AuthApiError("Invalid login credentials", 400, "invalid_credentials");
    const mapped = mapAuthError(err);
    expect(mapped.kind).toBe("invalid_credentials");
    expect(mapped.userMessage).not.toContain("Invalid login credentials");
  });

  it.each([
    "session_expired",
    "session_not_found",
    "refresh_token_not_found",
    "refresh_token_already_used",
  ])("classifies %s as session_expired", (code) => {
    const err = new AuthApiError("msg", 401, code);
    expect(mapAuthError(err).kind).toBe("session_expired");
  });

  it.each(["mfa_factor_not_found", "mfa_challenge_expired", "too_many_enrolled_mfa_factors"])(
    "classifies %s as mfa_challenge_failed",
    (code) => {
      const err = new AuthApiError("msg", 422, code);
      expect(mapAuthError(err).kind).toBe("mfa_challenge_failed");
    },
  );

  it.each(["mfa_verification_failed", "mfa_verification_rejected", "insufficient_aal"])(
    "classifies %s as mfa_verification_failed",
    (code) => {
      const err = new AuthApiError("msg", 422, code);
      expect(mapAuthError(err).kind).toBe("mfa_verification_failed");
    },
  );

  it("classifies over_request_rate_limit as authentication_unavailable", () => {
    const err = new AuthApiError("msg", 429, "over_request_rate_limit");
    expect(mapAuthError(err).kind).toBe("authentication_unavailable");
  });

  it("falls back to authentication_unavailable for an unrecognized Supabase Auth error code", () => {
    const err = new AuthApiError("msg", 500, "some_future_code_not_yet_known");
    expect(mapAuthError(err).kind).toBe("authentication_unavailable");
  });

  it("falls back to unknown for a completely unrelated thrown value", () => {
    expect(mapAuthError(new Error("plain error")).kind).toBe("unknown");
    expect(mapAuthError("a string").kind).toBe("unknown");
  });

  it("never exposes the original error's message as the user-facing message for any Supabase error", () => {
    const err = new AuthApiError("Sensitive internal detail", 500, "unexpected_failure");
    expect(mapAuthError(err).userMessage).not.toContain("Sensitive internal detail");
  });
});
