// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RequirePermission } from "./RequirePermission";
import { useAuthorization } from "../contexts/AuthorizationContext";
import type { Permission } from "../lib/authorization/permissions";

vi.mock("../contexts/AuthorizationContext", () => ({
  useAuthorization: vi.fn(),
}));

const mockUseAuthorization = vi.mocked(useAuthorization);

// See RequireAuth.test.tsx's identical comment — no `globals` in this
// workspace's vitest config, so Testing Library's auto-cleanup never
// self-registers.
afterEach(cleanup);

function renderWithPermissions(granted: Permission[], isAuthorizationLoading = false) {
  mockUseAuthorization.mockReturnValue({
    role: granted.length > 0 ? "reception_warden" : null,
    hostelId: null,
    staffName: null,
    permissions: granted,
    isAuthorizationLoading,
    isAuthorized: granted.length > 0,
    authorizationError: null,
    hasRole: () => false,
    hasPermission: (p) => granted.includes(p),
    can: (p) => granted.includes(p),
    canAccessHostel: () => false,
    refreshAuthorization: vi.fn(),
  });
  return render(
    <MemoryRouter>
      <RequirePermission permission="leave:queue:view">
        <div>Queue Content</div>
      </RequirePermission>
    </MemoryRouter>,
  );
}

describe("RequirePermission", () => {
  it("renders children when the permission is granted", () => {
    renderWithPermissions(["leave:queue:view"]);
    expect(screen.getByText("Queue Content")).toBeTruthy();
  });

  it("shows Access Denied in place when the permission is missing", () => {
    renderWithPermissions(["dashboard:view"]);
    expect(screen.queryByText("Queue Content")).toBeNull();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("fails closed while authorization is still loading", () => {
    renderWithPermissions([], true);
    expect(screen.queryByText("Queue Content")).toBeNull();
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("fails closed with zero permissions (e.g. library_incharge — not a Reception Dashboard role)", () => {
    renderWithPermissions([]);
    expect(screen.queryByText("Queue Content")).toBeNull();
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
