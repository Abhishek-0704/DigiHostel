import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { customFetch, setAuthTokenProvider, setApiBaseUrl } from "./custom-fetch";

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
    setApiBaseUrl(null);
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

describe("customFetch — Content-Type header (no-body POST routes)", () => {
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
  });

  // Reception-Initiated Parent Approval correction: found live, through a
  // real browser fetch against the running API — a no-body POST (e.g.
  // `/leave-requests/{id}/send-for-parent-approval`, `/expire`) previously
  // still carried `Content-Type: application/json` with `body: undefined`,
  // which Fastify's default JSON body parser rejects outright
  // (FST_ERR_CTP_EMPTY_JSON_BODY). vitest's `app.inject()`-based route tests
  // never caught this because they bypass this fetch layer entirely.
  it("omits Content-Type entirely for a request with no data (no body is ever sent)", async () => {
    await customFetch({ url: "/leave-requests/lr-1/send-for-parent-approval", method: "POST" });
    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((options.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
    expect(options.body).toBeUndefined();
  });

  it("sets Content-Type: application/json when a request body is supplied", async () => {
    await customFetch({
      url: "/leave-requests",
      method: "POST",
      data: { reason: "test" },
    });
    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((options.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(options.body).toBe(JSON.stringify({ reason: "test" }));
  });

  it("an explicit request header still overrides the default Content-Type", async () => {
    await customFetch({
      url: "/leave-requests",
      method: "POST",
      data: { reason: "test" },
      headers: { "Content-Type": "application/vnd.custom+json" },
    });
    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((options.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/vnd.custom+json",
    );
  });
});

describe("customFetch — query parameter serialization (Phase 4, Prompt 8)", () => {
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
  });

  // Found live through a real browser request against GET /students (the
  // first generated endpoint in this codebase with an optional query
  // parameter) — `new URLSearchParams({ q: undefined })` coerces the value
  // with `String()`, producing the literal query string `q=undefined`,
  // which the server then treated as a genuine (non-matching) search term
  // rather than "no search term supplied." vitest's `app.inject()`-based
  // route tests never caught this because they bypass this fetch layer
  // entirely, and no earlier GET route in this API had an optional
  // parameter to trigger it.
  it("omits an undefined param key entirely rather than serializing it as the literal string 'undefined'", async () => {
    await customFetch({
      url: "/students",
      method: "GET",
      params: { q: undefined, page: 1, pageSize: 20 },
    });
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).not.toContain("q=undefined");
    expect(url).toContain("page=1");
    expect(url).toContain("pageSize=20");
  });

  it("omits a null param key the same way", async () => {
    await customFetch({
      url: "/students",
      method: "GET",
      params: { q: null, page: 1 },
    });
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).not.toContain("q=null");
  });

  it("sends no query string at all when every param is undefined/null", async () => {
    await customFetch({ url: "/students", method: "GET", params: { q: undefined } });
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/students");
  });

  it("still serializes a genuinely supplied string value normally", async () => {
    await customFetch({ url: "/students", method: "GET", params: { q: "jane" } });
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("q=jane");
  });
});

describe("customFetch — API base URL override (Reception Dashboard scaffolding, Prompt 0.2)", () => {
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
    setApiBaseUrl(null);
  });

  it("falls back to EXPO_PUBLIC_API_BASE_URL when no override is registered (backward-compatible default)", async () => {
    const previous = process.env.EXPO_PUBLIC_API_BASE_URL;
    process.env.EXPO_PUBLIC_API_BASE_URL = "https://expo-fallback.example/api/v1";
    try {
      await customFetch({ url: "/leave-requests", method: "GET" });
      const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe("https://expo-fallback.example/api/v1/leave-requests");
    } finally {
      process.env.EXPO_PUBLIC_API_BASE_URL = previous;
    }
  });

  it("uses the registered override in preference to EXPO_PUBLIC_API_BASE_URL", async () => {
    const previous = process.env.EXPO_PUBLIC_API_BASE_URL;
    process.env.EXPO_PUBLIC_API_BASE_URL = "https://expo-fallback.example/api/v1";
    setApiBaseUrl("https://reception-dashboard.example/api/v1");
    try {
      await customFetch({ url: "/leave-requests", method: "GET" });
      const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe("https://reception-dashboard.example/api/v1/leave-requests");
    } finally {
      process.env.EXPO_PUBLIC_API_BASE_URL = previous;
    }
  });
});
