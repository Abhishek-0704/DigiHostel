// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { AuthApiError } from "@supabase/supabase-js";
import { MfaVerification } from "./MfaVerification";
import { mfaService } from "../../services/auth/mfaService";
import { staffAuthAuditService } from "../../services/auth/staffAuthAuditService";
import { useAuthContext } from "../../contexts/AuthContext";

vi.mock("../../services/auth/mfaService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/auth/mfaService")>();
  return {
    ...actual,
    mfaService: {
      listFactors: vi.fn(),
      challenge: vi.fn(),
      verify: vi.fn(),
      getAssuranceLevel: vi.fn(),
      enrollTotp: vi.fn(),
      unenroll: vi.fn(),
    },
  };
});
vi.mock("../../services/auth/staffAuthAuditService", () => ({
  staffAuthAuditService: { record: vi.fn() },
}));
vi.mock("../../contexts/AuthContext", () => ({
  useAuthContext: vi.fn(),
}));

const mockListFactors = vi.mocked(mfaService.listFactors);
const mockChallenge = vi.mocked(mfaService.challenge);
const mockVerify = vi.mocked(mfaService.verify);
const mockRecord = vi.mocked(staffAuthAuditService.record);
const mockUseAuthContext = vi.mocked(useAuthContext);

const refreshAssuranceLevel = vi.fn();
const signOut = vi.fn();

const VERIFIED_TOTP_FACTOR = {
  id: "factor-1",
  factor_type: "totp" as const,
  status: "verified" as const,
  created_at: "",
  updated_at: "",
};

function futureChallenge(overrides: Partial<{ id: string; expires_at: number }> = {}) {
  return {
    id: "challenge-1",
    type: "totp" as const,
    expires_at: Date.now() / 1000 + 300,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  // `refreshAssuranceLevel`/`signOut` are shared module-scope mocks (their
  // identity matters — MfaVerification destructures them once from the
  // mocked `useAuthContext()` return value) — clear their call history
  // between tests explicitly, since only the mfaService/staffAuthAuditService
  // mocks above are reset inline at the top of each test.
  refreshAssuranceLevel.mockClear();
  signOut.mockClear();
});

describe("MfaVerification", () => {
  it("automatically starts a challenge on mount and focuses the code field once ready", async () => {
    mockListFactors.mockReset().mockResolvedValue([VERIFIED_TOTP_FACTOR]);
    mockChallenge.mockReset().mockResolvedValue(futureChallenge());
    mockUseAuthContext.mockReturnValue({
      status: "mfa_required",
      signOut,
      refreshAssuranceLevel,
      lastSignOutReason: null,
      inactivityStatus: "active",
      inactivityRemainingMs: 0,
      resetInactivityTimer: vi.fn(),
    });

    render(<MfaVerification />);

    await waitFor(() => expect(screen.getByLabelText("Verification code")).toBeTruthy());
    expect(document.activeElement).toBe(screen.getByLabelText("Verification code"));
    expect(mockChallenge).toHaveBeenCalledWith({ factorId: "factor-1" });
  });

  it("shows a dedicated message and never a self-enrollment flow when no TOTP factor is enrolled", async () => {
    mockListFactors.mockReset().mockResolvedValue([]);
    mockUseAuthContext.mockReturnValue({
      status: "mfa_required",
      signOut,
      refreshAssuranceLevel,
      lastSignOutReason: null,
      inactivityStatus: "active",
      inactivityRemainingMs: 0,
      resetInactivityTimer: vi.fn(),
    });

    render(<MfaVerification />);

    await screen.findByText(/not set up for this account/);
    expect(screen.queryByLabelText("Verification code")).toBeNull();
    expect(screen.queryByText(/set up your authenticator/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(signOut).toHaveBeenCalled();
  });

  it("verifies a valid code and refreshes the assurance level on success", async () => {
    mockListFactors.mockReset().mockResolvedValue([VERIFIED_TOTP_FACTOR]);
    mockChallenge.mockReset().mockResolvedValue(futureChallenge());
    mockVerify.mockReset().mockResolvedValue({} as never);
    mockUseAuthContext.mockReturnValue({
      status: "mfa_required",
      signOut,
      refreshAssuranceLevel,
      lastSignOutReason: null,
      inactivityStatus: "active",
      inactivityRemainingMs: 0,
      resetInactivityTimer: vi.fn(),
    });

    render(<MfaVerification />);
    await screen.findByLabelText("Verification code");

    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() =>
      expect(mockVerify).toHaveBeenCalledWith({
        factorId: "factor-1",
        challengeId: "challenge-1",
        code: "123456",
      }),
    );
    await waitFor(() => expect(refreshAssuranceLevel).toHaveBeenCalled());
  });

  it("shows an invalid-code error and records mfa_failure, without navigating anywhere", async () => {
    mockListFactors.mockReset().mockResolvedValue([VERIFIED_TOTP_FACTOR]);
    mockChallenge.mockReset().mockResolvedValue(futureChallenge());
    mockVerify
      .mockReset()
      .mockRejectedValue(new AuthApiError("Invalid code", 422, "mfa_verification_failed"));
    mockRecord.mockReset();
    mockUseAuthContext.mockReturnValue({
      status: "mfa_required",
      signOut,
      refreshAssuranceLevel,
      lastSignOutReason: null,
      inactivityStatus: "active",
      inactivityRemainingMs: 0,
      resetInactivityTimer: vi.fn(),
    });

    render(<MfaVerification />);
    await screen.findByLabelText("Verification code");
    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await screen.findByText("That code isn't correct or has expired. Please try again.");
    expect(mockRecord).toHaveBeenCalledWith("mfa_failure");
    expect(refreshAssuranceLevel).not.toHaveBeenCalled();
  });

  it("offers a 'Request a new code' retry path that starts a fresh challenge", async () => {
    mockListFactors.mockReset().mockResolvedValue([VERIFIED_TOTP_FACTOR]);
    mockChallenge
      .mockReset()
      .mockResolvedValueOnce(futureChallenge({ id: "challenge-1" }))
      .mockResolvedValueOnce(futureChallenge({ id: "challenge-2" }));
    mockUseAuthContext.mockReturnValue({
      status: "mfa_required",
      signOut,
      refreshAssuranceLevel,
      lastSignOutReason: null,
      inactivityStatus: "active",
      inactivityRemainingMs: 0,
      resetInactivityTimer: vi.fn(),
    });

    render(<MfaVerification />);
    await screen.findByLabelText("Verification code");
    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "123456" } });

    fireEvent.click(screen.getByRole("button", { name: "Request a new code" }));

    await waitFor(() => expect(mockChallenge).toHaveBeenCalledTimes(2));
    // The stale code was cleared by the retry, not resubmitted against the new challenge.
    expect((screen.getByLabelText("Verification code") as HTMLInputElement).value).toBe("");
  });

  it("detects an already-expired challenge client-side and never calls verify() for it", async () => {
    mockListFactors.mockReset().mockResolvedValue([VERIFIED_TOTP_FACTOR]);
    mockChallenge
      .mockReset()
      .mockResolvedValue(futureChallenge({ expires_at: Date.now() / 1000 - 60 }));
    mockVerify.mockReset();
    mockUseAuthContext.mockReturnValue({
      status: "mfa_required",
      signOut,
      refreshAssuranceLevel,
      lastSignOutReason: null,
      inactivityStatus: "active",
      inactivityRemainingMs: 0,
      resetInactivityTimer: vi.fn(),
    });

    render(<MfaVerification />);
    await screen.findByLabelText("Verification code");
    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await screen.findByText("We couldn't start a verification code check. Please try again.");
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("only accepts a 6-digit code before attempting verification", async () => {
    mockListFactors.mockReset().mockResolvedValue([VERIFIED_TOTP_FACTOR]);
    mockChallenge.mockReset().mockResolvedValue(futureChallenge());
    mockVerify.mockReset();
    mockUseAuthContext.mockReturnValue({
      status: "mfa_required",
      signOut,
      refreshAssuranceLevel,
      lastSignOutReason: null,
      inactivityStatus: "active",
      inactivityRemainingMs: 0,
      resetInactivityTimer: vi.fn(),
    });

    render(<MfaVerification />);
    await screen.findByLabelText("Verification code");
    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    expect(screen.getByText("Enter the 6-digit code from your authenticator app.")).toBeTruthy();
    expect(mockVerify).not.toHaveBeenCalled();
  });
});
