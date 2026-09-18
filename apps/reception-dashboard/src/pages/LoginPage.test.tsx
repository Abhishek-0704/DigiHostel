// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import LoginPage from "./LoginPage";
import { useAuthContext } from "../contexts/AuthContext";
import { useAuthorization } from "../contexts/AuthorizationContext";
import type { AuthStatus } from "../contexts/authStatus";
import { AppError } from "../lib/errors/errors";

vi.mock("../contexts/AuthContext", () => ({
  useAuthContext: vi.fn(),
}));
vi.mock("../contexts/AuthorizationContext", () => ({
  useAuthorization: vi.fn(),
}));
// LoginPage's own job is choosing which STEP to render from
// AuthContext/AuthorizationContext state — LoginForm's and
// MfaVerification's own internal behavior (validation, submission, TOTP
// challenge lifecycle) already has dedicated coverage in their own test
// files. Stubbing them here keeps these tests focused on that routing
// decision and independent of real Supabase/service calls.
vi.mock("../components/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../components/auth")>();
  return {
    ...actual,
    LoginForm: ({ notice }: { notice?: string }) => (
      <div data-testid="login-form-stub">{notice}</div>
    ),
    MfaVerification: () => <div data-testid="mfa-verification-stub" />,
  };
});

const mockUseAuthContext = vi.mocked(useAuthContext);
const mockUseAuthorization = vi.mocked(useAuthorization);

// See RequireAuth.test.tsx's identical comment — this workspace's Vitest
// config doesn't use `globals`, so Testing Library's auto-cleanup never
// self-registers.
afterEach(cleanup);

const signOut = vi.fn();
const refreshAuthorization = vi.fn();

function authContextValue(
  status: AuthStatus,
  overrides: Partial<ReturnType<typeof useAuthContext>> = {},
) {
  return {
    status,
    signOut,
    refreshAssuranceLevel: vi.fn(),
    lastSignOutReason: null,
    inactivityStatus: "active" as const,
    inactivityRemainingMs: 0,
    resetInactivityTimer: vi.fn(),
    ...overrides,
  };
}

function authorizationValue(overrides: Partial<ReturnType<typeof useAuthorization>> = {}) {
  return {
    role: null,
    hostelId: null,
    staffName: null,
    permissions: [],
    isAuthorizationLoading: false,
    isAuthorized: false,
    authorizationError: null,
    hasRole: () => false,
    hasPermission: () => false,
    can: () => false,
    canAccessHostel: () => false,
    refreshAuthorization,
    ...overrides,
  };
}

function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<div>Dashboard Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LoginPage — branding and rendering", () => {
  it("shows the institutional title, security notice, and footer on the credentials step", () => {
    mockUseAuthContext.mockReturnValue(authContextValue("unauthenticated"));
    mockUseAuthorization.mockReturnValue(authorizationValue());
    renderLoginPage();

    expect(screen.getByRole("heading", { name: "Reception Dashboard" })).toBeTruthy();
    // "KIIT Hostel Management System" legitimately appears twice (the brand
    // label and the footer's copyright line) — assert both are present
    // rather than a single ambiguous query.
    expect(screen.getAllByText(/KIIT Hostel Management System/)).toHaveLength(2);
    expect(screen.getByText(/Authorized hostel staff only/)).toBeTruthy();
    expect(screen.getByText(/Support contact not yet configured/)).toBeTruthy();
  });

  it("renders the credentials step (LoginForm) when unauthenticated", () => {
    mockUseAuthContext.mockReturnValue(authContextValue("unauthenticated"));
    mockUseAuthorization.mockReturnValue(authorizationValue());
    renderLoginPage();

    expect(screen.getByTestId("login-form-stub")).toBeTruthy();
    expect(screen.queryByTestId("mfa-verification-stub")).toBeNull();
  });
});

describe("LoginPage — authentication step derivation", () => {
  it("shows a single loading indicator while status is loading", () => {
    mockUseAuthContext.mockReturnValue(authContextValue("loading"));
    mockUseAuthorization.mockReturnValue(authorizationValue());
    renderLoginPage();

    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.queryByTestId("login-form-stub")).toBeNull();
  });

  it("shows a config-error message when Supabase isn't configured", () => {
    mockUseAuthContext.mockReturnValue(authContextValue("config_error"));
    mockUseAuthorization.mockReturnValue(authorizationValue());
    renderLoginPage();

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByTestId("login-form-stub")).toBeNull();
  });

  it("shows the MFA step, not the password form, when mfa_required", () => {
    mockUseAuthContext.mockReturnValue(authContextValue("mfa_required"));
    mockUseAuthorization.mockReturnValue(authorizationValue());
    renderLoginPage();

    expect(screen.getByTestId("mfa-verification-stub")).toBeTruthy();
    expect(screen.queryByTestId("login-form-stub")).toBeNull();
  });

  it("passes an inline session-expired notice to the credentials step after session_invalid", () => {
    mockUseAuthContext.mockReturnValue(
      authContextValue("unauthenticated", { lastSignOutReason: "session_invalid" }),
    );
    mockUseAuthorization.mockReturnValue(authorizationValue());
    renderLoginPage();

    expect(screen.getByText(/Your session has expired/)).toBeTruthy();
  });

  it("passes no notice on an ordinary first visit (lastSignOutReason is null)", () => {
    mockUseAuthContext.mockReturnValue(authContextValue("unauthenticated"));
    mockUseAuthorization.mockReturnValue(authorizationValue());
    renderLoginPage();

    expect(screen.getByTestId("login-form-stub").textContent).toBe("");
  });
});

describe("LoginPage — authorization resolution (§17)", () => {
  it("shows 'Loading staff access…' once authenticated but before authorization resolves", () => {
    mockUseAuthContext.mockReturnValue(authContextValue("authenticated"));
    mockUseAuthorization.mockReturnValue(authorizationValue({ isAuthorizationLoading: true }));
    renderLoginPage();

    expect(screen.getByText("Loading staff access…")).toBeTruthy();
  });

  it("redirects to /dashboard once authenticated AND authorized", () => {
    mockUseAuthContext.mockReturnValue(authContextValue("authenticated"));
    mockUseAuthorization.mockReturnValue(authorizationValue({ isAuthorized: true }));
    renderLoginPage();

    expect(screen.getByText("Dashboard Home")).toBeTruthy();
  });

  it("never redirects to the dashboard for an AAL2 session with no staff record — shows a denial + sign-out instead", () => {
    mockUseAuthContext.mockReturnValue(authContextValue("authenticated"));
    mockUseAuthorization.mockReturnValue(
      authorizationValue({
        authorizationError: new AppError(
          "unauthorized_staff",
          "This account isn't set up for reception dashboard access.",
        ),
      }),
    );
    renderLoginPage();

    expect(screen.queryByText("Dashboard Home")).toBeNull();
    expect(screen.getByText(/isn't set up for reception dashboard access/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(signOut).toHaveBeenCalled();
  });

  it("shows a retryable error when the staff-profile read itself failed", () => {
    mockUseAuthContext.mockReturnValue(authContextValue("authenticated"));
    mockUseAuthorization.mockReturnValue(
      authorizationValue({
        authorizationError: new AppError(
          "authorization_unavailable",
          "We couldn't determine what you're allowed to do. Please try again.",
        ),
      }),
    );
    renderLoginPage();

    expect(screen.queryByText("Dashboard Home")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refreshAuthorization).toHaveBeenCalled();
  });
});
