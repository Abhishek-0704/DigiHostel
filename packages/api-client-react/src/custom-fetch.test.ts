import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { customFetch, setAuthTokenProvider } from "./custom-fetch";

describe("customFetch — auth token provider (Prompt 3, apps/parent-mobile)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    setAuthTokenProvider(null);
  });

  it("attaches no Authorization header when no provider is registered (backward-compatible default)", async () => {
    await customFetch({ url: "/leave-requests", method: "GET" });
    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((options.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("attaches Authorization: Bearer <token> when a provider returns a token", async () => {
    setAuthTokenProvider(async () => "real-token-value");
    await customFetch({ url: "/leave-requests", method: "GET" });
    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((options.headers as Record<string, string>).Authorization).toBe(
      "Bearer real-token-value",
    );
  });

  it("attaches no Authorization header when the provider resolves null (no session)", async () => {
    setAuthTokenProvider(async () => null);
    await customFetch({ url: "/leave-requests", method: "GET" });
    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((options.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("an explicit request header still overrides the provider-supplied Authorization header", async () => {
    setAuthTokenProvider(async () => "provider-token");
    await customFetch({
      url: "/leave-requests",
      method: "GET",
      headers: { Authorization: "Bearer explicit-override" },
    });
    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((options.headers as Record<string, string>).Authorization).toBe(
      "Bearer explicit-override",
    );
  });
});
