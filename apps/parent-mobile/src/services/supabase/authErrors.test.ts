import { describe, it, expect } from "vitest";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { mapAuthError } from "./authErrors";
import { AppError, safeMessageFor } from "../../types/errors";

describe("mapAuthError", () => {
  it("a network-retryable Supabase error maps to the 'network' kind", () => {
    const raw = new AuthRetryableFetchError("fetch failed", 0);
    const mapped = mapAuthError(raw);
    expect(mapped.kind).toBe("network");
    expect(mapped.userMessage).toBe(safeMessageFor("network"));
    expect(mapped.cause).toBe(raw);
  });

  it.each([
    ["session_expired", "session_restore_failed"],
    ["session_not_found", "session_restore_failed"],
    ["refresh_token_not_found", "session_refresh_failed"],
    ["refresh_token_already_used", "session_refresh_failed"],
    ["some_unrecognized_future_code", "auth_provider_unavailable"],
  ] as const)("Supabase code '%s' classifies as '%s'", (code, expectedKind) => {
    const raw = new AuthApiError("raw supabase message, never shown to the user", 400, code);
    const mapped = mapAuthError(raw);
    expect(mapped.kind).toBe(expectedKind);
    expect(mapped.userMessage).toBe(safeMessageFor(expectedKind));
    // The raw Supabase message must never leak into the user-facing text.
    expect(mapped.userMessage).not.toContain("raw supabase message");
  });

  it("an already-mapped AppError is passed through unchanged", () => {
    const original = new AppError(
      "session_restore_failed",
      safeMessageFor("session_restore_failed"),
    );
    expect(mapAuthError(original)).toBe(original);
  });

  it("a totally unrecognized thrown value still becomes a safe, generic AppError", () => {
    const mapped = mapAuthError("a plain string");
    expect(mapped).toBeInstanceOf(AppError);
    expect(mapped.kind).toBe("unknown");
  });
});
