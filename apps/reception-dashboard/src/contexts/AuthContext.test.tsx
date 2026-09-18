// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { AuthProvider, useAuthContext } from "./AuthContext";
import { useSessionContext } from "./SessionContext";
import { authService } from "../services/auth/authService";
import { mfaService } from "../services/auth/mfaService";
import { staffAuthAuditService } from "../services/auth/staffAuthAuditService";
import { useInactivityTimer } from "../hooks/useInactivityTimer";
import type { Session } from "@supabase/supabase-js";

vi.mock("./SessionContext", () => ({ useSessionContext: vi.fn() }));
vi.mock("../services/auth/authService", () => ({ authService: { signOut: vi.fn() } }));
vi.mock("../services/auth/mfaService", () => ({ mfaService: { getAssuranceLevel: vi.fn() } }));
vi.mock("../services/auth/staffAuthAuditService", () => ({
  staffAuthAuditService: { record: vi.fn() },
}));
vi.mock("../hooks/useInactivityTimer", () => ({ useInactivityTimer: vi.fn() }));

const mockUseSessionContext = vi.mocked(useSessionContext);
const mockGetAssuranceLevel = vi.mocked(mfaService.getAssuranceLevel);
const mockRecord = vi.mocked(staffAuthAuditService.record);
const mockSignOut = vi.mocked(authService.signOut);
const mockUseInactivityTimer = vi.mocked(useInactivityTimer);

const SESSION = { access_token: "tok", user: { id: "u1" } } as unknown as Session;

function Consumer() {
  const ctx = useAuthContext();
  return (
    <div>
      <span data-testid="status">{ctx.status}</span>
      <span data-testid="reason">{ctx.lastSignOutReason ?? "none"}</span>
      <button onClick={() => void ctx.signOut()}>sign out</button>
    </div>
  );
}

function renderWithSession(session: Session | null, isLoading = false, configError = false) {
  mockUseSessionContext.mockReturnValue({ session, isLoading, configError });
  return render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  mockUseInactivityTimer.mockReturnValue({
    status: "active",
    remainingMs: 900_000,
    resetActivity: vi.fn(),
  });
  mockGetAssuranceLevel.mockResolvedValue({
    currentLevel: "aal1",
    nextLevel: "aal2",
    currentAuthenticationMethods: [],
  });
  mockSignOut.mockResolvedValue(undefined);
});

describe("AuthContext — status derivation (unchanged contract)", () => {
  it("reports unauthenticated with no session", async () => {
    renderWithSession(null);
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
  });

  it("reports mfa_required for an aal1 session", async () => {
    renderWithSession(SESSION);
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("mfa_required"));
  });

  it("reports authenticated only once aal2 is genuinely reached", async () => {
    mockGetAssuranceLevel.mockResolvedValue({
      currentLevel: "aal2",
      nextLevel: "aal2",
      currentAuthenticationMethods: [],
    });
    renderWithSession(SESSION);
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated"));
  });
});

describe("AuthContext — reactive audit events", () => {
  it("does NOT report sign_in_success for an already-existing session on first load (page refresh)", async () => {
    renderWithSession(SESSION);
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("mfa_required"));
    expect(mockRecord).not.toHaveBeenCalledWith("sign_in_success");
  });

  it("does NOT report mfa_success for an already-aal2 session on first load (page refresh)", async () => {
    mockGetAssuranceLevel.mockResolvedValue({
      currentLevel: "aal2",
      nextLevel: "aal2",
      currentAuthenticationMethods: [],
    });
    renderWithSession(SESSION);
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated"));
    expect(mockRecord).not.toHaveBeenCalledWith("mfa_success");
  });

  it("reports sign_out (while the token is still valid) when signOut() is called", async () => {
    renderWithSession(SESSION);
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("mfa_required"));

    screen.getByText("sign out").click();

    await waitFor(() => expect(mockRecord).toHaveBeenCalledWith("sign_out"));
    expect(mockSignOut).toHaveBeenCalled();
  });
});

describe("AuthContext — sign-out reason tracking", () => {
  it("defaults to user_initiated when signOut() is called with no explicit reason", async () => {
    renderWithSession(SESSION);
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("mfa_required"));

    screen.getByText("sign out").click();

    await waitFor(() => expect(screen.getByTestId("reason").textContent).toBe("user_initiated"));
  });

  it("reports session_invalid when the session disappears WITHOUT signOut() being called", async () => {
    const { rerender } = renderWithSession(SESSION);
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("mfa_required"));

    mockUseSessionContext.mockReturnValue({ session: null, isLoading: false, configError: false });
    rerender(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("reason").textContent).toBe("session_invalid"));
    // The unexpected-loss path never calls our own signOut()/authService.signOut at all.
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});

describe("AuthContext — inactivity timeout integration", () => {
  it("signs out with reason inactivity_timeout when the inactivity timer reports expired while authenticated", async () => {
    mockGetAssuranceLevel.mockResolvedValue({
      currentLevel: "aal2",
      nextLevel: "aal2",
      currentAuthenticationMethods: [],
    });
    mockUseInactivityTimer.mockReturnValue({
      status: "expired",
      remainingMs: 0,
      resetActivity: vi.fn(),
    });

    renderWithSession(SESSION);

    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId("reason").textContent).toBe("inactivity_timeout"),
    );
  });

  it("does not sign out due to inactivity when not yet authenticated (e.g. still mfa_required)", async () => {
    mockUseInactivityTimer.mockReturnValue({
      status: "expired",
      remainingMs: 0,
      resetActivity: vi.fn(),
    });
    renderWithSession(SESSION); // aal1 -> mfa_required, never reaches "authenticated"

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("mfa_required"));
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
