import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthApiError } from "@supabase/supabase-js";

const fakeAuth = {
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(),
};
vi.mock("./client", () => ({
  getSupabaseClient: () => ({ auth: fakeAuth }),
}));

const { authService } = await import("./auth");

describe("authService.sendOtp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an invalid phone number before ever calling Supabase", async () => {
    await expect(authService.sendOtp("not-a-number")).rejects.toMatchObject({
      kind: "invalid_phone_number",
    });
    expect(fakeAuth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("calls Supabase's signInWithOtp with a valid phone number and resolves on success", async () => {
    fakeAuth.signInWithOtp.mockResolvedValue({ error: null });
    await expect(authService.sendOtp("+919000000001")).resolves.toBeUndefined();
    expect(fakeAuth.signInWithOtp).toHaveBeenCalledWith({ phone: "+919000000001" });
  });

  it("maps a Supabase rate-limit error to the safe otp_rate_limited kind, not the raw error", async () => {
    fakeAuth.signInWithOtp.mockResolvedValue({
      error: new AuthApiError("raw rate limit detail", 429, "over_sms_send_rate_limit"),
    });
    await expect(authService.sendOtp("+919000000001")).rejects.toMatchObject({
      kind: "otp_rate_limited",
    });
  });
});

describe("authService.verifyOtp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the session on success", async () => {
    const fakeSession = { access_token: "irrelevant-in-this-test" };
    fakeAuth.verifyOtp.mockResolvedValue({ data: { session: fakeSession }, error: null });
    await expect(authService.verifyOtp("+919000000001", "123456")).resolves.toBe(fakeSession);
    expect(fakeAuth.verifyOtp).toHaveBeenCalledWith({
      phone: "+919000000001",
      token: "123456",
      type: "sms",
    });
  });

  it("maps an invalid-code error to otp_invalid", async () => {
    fakeAuth.verifyOtp.mockResolvedValue({
      data: { session: null },
      error: new AuthApiError("raw detail", 400, "invalid_credentials"),
    });
    await expect(authService.verifyOtp("+919000000001", "000000")).rejects.toMatchObject({
      kind: "otp_invalid",
    });
  });

  it("treats a resolved-but-sessionless response as a failure too (defensive — should not happen per the SDK's own contract, but must not silently proceed as if authenticated)", async () => {
    fakeAuth.verifyOtp.mockResolvedValue({ data: { session: null }, error: null });
    await expect(authService.verifyOtp("+919000000001", "123456")).rejects.toBeTruthy();
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
