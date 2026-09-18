// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { RequireAuth } from "./RequireAuth";
import { useAuthContext } from "../contexts/AuthContext";
import type { AuthStatus } from "../contexts/authStatus";

vi.mock("../contexts/AuthContext", () => ({
  useAuthContext: vi.fn(),
}));

const mockUseAuthContext = vi.mocked(useAuthContext);

// This workspace's vitest.config.ts deliberately does not enable `globals`
// (every test file imports describe/it/expect explicitly) — Testing
// Library's automatic afterEach(cleanup) only self-registers when it
// detects a GLOBAL afterEach, so without this every render() in this file
// would otherwise leak into the next test's DOM. Discovered empirically
// this prompt while adding the very first component tests to this app.
afterEach(cleanup);

function renderWithStatus(status: AuthStatus) {
  mockUseAuthContext.mockReturnValue({
    status,
    signOut: vi.fn(),
    refreshAssuranceLevel: vi.fn(),
    lastSignOutReason: null,
    inactivityStatus: "active",
    inactivityRemainingMs: 0,
    resetInactivityTimer: vi.fn(),
  });
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <div>Protected Content</div>
            </RequireAuth>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

// Prompt 3 §12 — regression coverage for the ASRB-flagged deny-list fix:
// every one of these is a distinct branch RequireAuth must handle, and the
// last test is the actual proof the guard now fails closed by construction
// rather than by the AuthStatus union happening to be fully enumerated.
describe("RequireAuth", () => {
  it("renders children when authenticated", () => {
    renderWithStatus("authenticated");
    expect(screen.getByText("Protected Content")).toBeTruthy();
  });

  it("redirects to /login when unauthenticated", () => {
    renderWithStatus("unauthenticated");
    expect(screen.getByText("Login Page")).toBeTruthy();
  });

  it("redirects to /login when mfa_required (password-only session is never sufficient)", () => {
    renderWithStatus("mfa_required");
    expect(screen.getByText("Login Page")).toBeTruthy();
  });

  it("shows a loading indicator while loading, renders neither content nor login", () => {
    renderWithStatus("loading");
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByText("Protected Content")).toBeNull();
    expect(screen.queryByText("Login Page")).toBeNull();
  });

  it("shows a config-error message on config_error, never renders protected content", () => {
    renderWithStatus("config_error");
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Protected Content")).toBeNull();
  });

  it("fails closed for a status this component doesn't recognize (allow-list, not deny-list)", () => {
    // Cast is deliberate: this simulates a FUTURE AuthStatus value added
    // without updating RequireAuth — exactly the fragility the Prompt 0.3
    // ASRB finding named. A correct allow-list denies by default here.
    renderWithStatus("some_future_status_not_yet_known" as AuthStatus);
    expect(screen.getByText("Login Page")).toBeTruthy();
    expect(screen.queryByText("Protected Content")).toBeNull();
  });
});
