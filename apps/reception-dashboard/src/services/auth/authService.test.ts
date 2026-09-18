import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthApiError } from "@supabase/supabase-js";
import { authService } from "./authService";
import { getSupabaseClient } from "../../lib/supabase/client";
import { AppError } from "../../lib/errors/errors";

vi.mock("../../lib/supabase/client", () => ({
  getSupabaseClient: vi.fn(),
}));

function mockClient(overrides: Partial<Record<string, unknown>> = {}) {
  const auth = {
    signInWithPassword: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    onAuthStateChange: vi
      .fn()
      .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
  vi.mocked(getSupabaseClient).mockReturnValue({ auth } as never);
  return auth;
}

describe("authService.signIn", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the session on success", async () => {
    const session = { access_token: "tok", user: { id: "u1" } };
    const auth = mockClient({
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    });

    const result = await authService.signIn("reception1@example.test", "correct-password");

    expect(result).toBe(session);
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "reception1@example.test",
      password: "correct-password",
    });
  });

  it("throws a sanitized AppError (never the raw Supabase error) on invalid credentials", async () => {
    const rawError = new AuthApiError("Invalid login credentials", 400, "invalid_credentials");
    mockClient({
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session: null }, error: rawError }),
    });

    await expect(authService.signIn("x@example.test", "wrong")).rejects.toMatchObject({
      kind: "invalid_credentials",
    });
    try {
      await authService.signIn("x@example.test", "wrong");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).userMessage).not.toContain("Invalid login credentials");
    }
  });

  it("fails closed if Supabase reports success but returns no session (should not happen, but never treated as signed in)", async () => {
    mockClient({
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    });

    await expect(authService.signIn("x@example.test", "pw")).rejects.toBeInstanceOf(AppError);
  });
});

describe("authService.signOut", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves without error even when called with no active session (idempotent)", async () => {
    const auth = mockClient({ signOut: vi.fn().mockResolvedValue({ error: null }) });
    await authService.signOut();
    await authService.signOut();
    expect(auth.signOut).toHaveBeenCalledTimes(2);
  });
});

describe("authService.getSession / getUser / getAccessToken", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getAccessToken returns null when there is no session", async () => {
    mockClient({ getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }) });
    expect(await authService.getAccessToken()).toBeNull();
  });

  it("getAccessToken returns the access token when a session exists", async () => {
    mockClient({
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session: { access_token: "real-token" } }, error: null }),
    });
    expect(await authService.getAccessToken()).toBe("real-token");
  });
});
