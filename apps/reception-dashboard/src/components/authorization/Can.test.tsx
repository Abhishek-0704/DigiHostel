// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Can } from "./Can";
import { useAuthorization } from "../../contexts/AuthorizationContext";
import type { Permission } from "../../lib/authorization/permissions";
import type { StaffRole } from "../../types/roles";

vi.mock("../../contexts/AuthorizationContext", () => ({
  useAuthorization: vi.fn(),
}));

const mockUseAuthorization = vi.mocked(useAuthorization);

// See RequireAuth.test.tsx's identical comment — no `globals` in this
// workspace's vitest config, so Testing Library's auto-cleanup never
// self-registers.
afterEach(cleanup);

function mockGranted(permissions: Permission[], role: StaffRole | null = "reception_warden") {
  mockUseAuthorization.mockReturnValue({
    role,
    hostelId: null,
    staffName: null,
    permissions,
    isAuthorizationLoading: false,
    isAuthorized: permissions.length > 0,
    authorizationError: null,
    hasRole: (r) => r === role,
    hasPermission: (p) => permissions.includes(p),
    can: (p) => permissions.includes(p),
    canAccessHostel: () => false,
    refreshAuthorization: vi.fn(),
  });
}

describe("Can", () => {
  it("renders children when the required permission is granted", () => {
    mockGranted(["leave:queue:view"]);
    render(
      <Can permission="leave:queue:view">
        <button>Expire request</button>
      </Can>,
    );
    expect(screen.getByText("Expire request")).toBeTruthy();
  });

  it("renders nothing (silent hide) by default when the permission is missing", () => {
    mockGranted(["dashboard:view"]);
    const { container } = render(
      <Can permission="users:manage">
        <button>Manage users</button>
      </Can>,
    );
    expect(screen.queryByText("Manage users")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("renders the provided fallback instead of silently hiding, when given one", () => {
    mockGranted(["dashboard:view"]);
    render(
      <Can permission="users:manage" fallback={<span>Not allowed</span>}>
        <button>Manage users</button>
      </Can>,
    );
    expect(screen.getByText("Not allowed")).toBeTruthy();
  });

  it("anyPermission renders children if at least one listed permission is granted", () => {
    mockGranted(["reports:view"]);
    render(
      <Can anyPermission={["reports:view", "reports:generate"]}>
        <span>Reports area</span>
      </Can>,
    );
    expect(screen.getByText("Reports area")).toBeTruthy();
  });

  it("role check renders children only for an exact role match", () => {
    mockGranted(["dashboard:view"], "super_admin");
    const { rerender } = render(
      <Can role="super_admin">
        <span>Admin-only</span>
      </Can>,
    );
    expect(screen.getByText("Admin-only")).toBeTruthy();

    mockGranted(["dashboard:view"], "reception_warden");
    rerender(
      <Can role="super_admin">
        <span>Admin-only</span>
      </Can>,
    );
    expect(screen.queryByText("Admin-only")).toBeNull();
  });
});
