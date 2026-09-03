import { describe, it, expect } from "vitest";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { mapAuthError } from "./authErrors";
import { AppError, safeMessageFor } from "../../types/errors";

describe("mapAuthError", () => {
  it("a network-retryable Supabase error maps to the 'network' kind", () => {
    const raw = new AuthRetryableFetchError("fetch failed", 0);
    const mapped = mapAuthError(raw, "send_otp");
    expect(mapped.kind).toBe("network");
    expect(mapped.userMessage).toBe(safeMessageFor("network"));
    expect(mapped.cause).toBe(raw);
  });

  it.each([
    ["over_sms_send_rate_limit", "otp_rate_limited"],
    ["over_request_rate_limit", "otp_rate_limited"],
    ["sms_send_failed", "otp_send_failed"],
    ["phone_provider_disabled", "otp_send_failed"],
    ["otp_expired", "otp_expired"],
    ["invalid_credentials", "otp_invalid"],
    ["otp_disabled", "otp_invalid"],
    ["session_expired", "session_restore_failed"],
    ["session_not_found", "session_restore_failed"],
    ["refresh_token_not_found", "session_refresh_failed"],
    ["refresh_token_already_used", "session_refresh_failed"],
    ["some_unrecognized_future_code", "auth_provider_unavailable"],
  ] as const)(
    "Supabase code '%s' classifies as '%s' regardless of context",
    (code, expectedKind) => {
      const raw = new AuthApiError("raw supabase message, never shown to the user", 400, code);
      const mapped = mapAuthError(raw, "send_otp");
      expect(mapped.kind).toBe(expectedKind);
      expect(mapped.userMessage).toBe(safeMessageFor(expectedKind));
      // The raw Supabase message must never leak into the user-facing text.
      expect(mapped.userMessage).not.toContain("raw supabase message");
    },
  );

  it("'validation_failed' means an invalid phone number in the send_otp context", () => {
    const raw = new AuthApiError("bad phone", 400, "validation_failed");
    expect(mapAuthError(raw, "send_otp").kind).toBe("invalid_phone_number");
  });

  it("'validation_failed' means an invalid code in the verify_otp context", () => {
    const raw = new AuthApiError("bad code", 400, "validation_failed");
    expect(mapAuthError(raw, "verify_otp").kind).toBe("otp_invalid");
  });

  it("an already-mapped AppError is passed through unchanged", () => {
    const original = new AppError("otp_expired", safeMessageFor("otp_expired"));
    expect(mapAuthError(original, "verify_otp")).toBe(original);
  });

  it("a totally unrecognized thrown value still becomes a safe, generic AppError", () => {
    const mapped = mapAuthError("a plain string", "send_otp");
    expect(mapped).toBeInstanceOf(AppError);
    expect(mapped.kind).toBe("unknown");
  });
});
