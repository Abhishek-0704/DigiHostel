// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RequireRole } from "./RequireRole";
import { useAuthorization } from "../contexts/AuthorizationContext";

vi.mock("../contexts/AuthorizationContext", () => ({
  useAuthorization: vi.fn(),
}));

const mockUseAuthorization = vi.mocked(useAuthorization);

// See RequireAuth.test.tsx's identical comment — this workspace's vitest
// config doesn't enable `globals`, so Testing Library's auto-cleanup never
// self-registers; without this, render() calls leak across tests in this
// file.
afterEach(cleanup);

function renderWithRole(
  role: "reception_warden" | "hostel_admin" | "super_admin" | null,
  isAuthorizationLoading = false,
) {
  mockUseAuthorization.mockReturnValue({
    role,
    hostelId: null,
    staffName: null,
    permissions: [],
    isAuthorizationLoading,
    isAuthorized: role !== null,
    authorizationError: null,
    hasRole: (r) => r === role,
    hasPermission: () => false,
    can: () => false,
    canAccessHostel: () => false,
    refreshAuthorization: vi.fn(),
  });
  return render(
    <MemoryRouter>
      <RequireRole roles={["reception_warden", "hostel_admin"]}>
        <div>Authorized Content</div>
      </RequireRole>
    </MemoryRouter>,
  );
}

describe("RequireRole", () => {
  it("renders children when the resolved role is in the allowed list", () => {
    renderWithRole("reception_warden");
    expect(screen.getByText("Authorized Content")).toBeTruthy();
  });

  it("shows Access Denied in place (never a redirect) when the role isn't allowed", () => {
    renderWithRole("super_admin");
    expect(screen.queryByText("Authorized Content")).toBeNull();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("fails closed while authorization is still loading — no premature access", () => {
    renderWithRole(null, true);
    expect(screen.queryByText("Authorized Content")).toBeNull();
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("fails closed when no role is resolved at all (no staff profile)", () => {
    renderWithRole(null, false);
    expect(screen.queryByText("Authorized Content")).toBeNull();
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
