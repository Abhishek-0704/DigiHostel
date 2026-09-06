import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthApiError } from "@supabase/supabase-js";

const fakeAuth = {
  setSession: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(),
};
vi.mock("./client", () => ({
  getSupabaseClient: () => ({ auth: fakeAuth }),
}));

const { authService } = await import("./auth");

describe("authService.adoptSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls Supabase's setSession with the backend-issued tokens and resolves with the session", async () => {
    const fakeSession = { access_token: "irrelevant-in-this-test" };
    fakeAuth.setSession.mockResolvedValue({ data: { session: fakeSession }, error: null });

    await expect(authService.adoptSession("access-tok", "refresh-tok")).resolves.toBe(fakeSession);
    expect(fakeAuth.setSession).toHaveBeenCalledWith({
      access_token: "access-tok",
      refresh_token: "refresh-tok",
    });
  });

  it("maps a Supabase error to the safe error taxonomy, never throwing the raw error", async () => {
    fakeAuth.setSession.mockResolvedValue({
      data: { session: null },
      error: new AuthApiError("raw detail", 400, "session_not_found"),
    });
    await expect(authService.adoptSession("access-tok", "refresh-tok")).rejects.toMatchObject({
      kind: "session_restore_failed",
    });
  });

  it("treats a resolved-but-sessionless response as a failure too (defensive — should not happen per the SDK's own contract, but must not silently proceed as if authenticated)", async () => {
    fakeAuth.setSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(authService.adoptSession("access-tok", "refresh-tok")).rejects.toBeTruthy();
  });
});

describe("authService.getAccessToken", () => {
  it("returns the access token from the current session", async () => {
    fakeAuth.getSession.mockResolvedValue({ data: { session: { access_token: "tok-abc" } } });
    await expect(authService.getAccessToken()).resolves.toBe("tok-abc");
  });

  it("returns null when there is no session", async () => {
    fakeAuth.getSession.mockResolvedValue({ data: { session: null } });
    await expect(authService.getAccessToken()).resolves.toBeNull();
  });
});
