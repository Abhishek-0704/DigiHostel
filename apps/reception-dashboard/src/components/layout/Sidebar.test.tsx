// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { useAuthorization } from "../../contexts/AuthorizationContext";
import type { Permission } from "../../lib/authorization/permissions";

vi.mock("../../contexts/AuthorizationContext", () => ({
  useAuthorization: vi.fn(),
}));

const mockUseAuthorization = vi.mocked(useAuthorization);

afterEach(cleanup);

function authValue(overrides: Partial<ReturnType<typeof useAuthorization>> = {}) {
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
    refreshAuthorization: vi.fn(),
    ...overrides,
  };
}

function renderSidebar(collapsed = false, onToggleCollapsed = vi.fn()) {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Sidebar collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} />
    </MemoryRouter>,
  );
}

describe("Sidebar — permission-aware rendering", () => {
  it("shows nothing while authorization is loading (fail closed, no flash)", () => {
    mockUseAuthorization.mockReturnValue(authValue({ isAuthorizationLoading: true }));
    renderSidebar();
    expect(screen.queryByText("Dashboard")).toBeNull();
  });

  it("shows only permitted top-level items and groups", () => {
    const granted = new Set<Permission>(["dashboard:view", "leave:queue:view"]);
    mockUseAuthorization.mockReturnValue(authValue({ hasPermission: (p) => granted.has(p) }));
    renderSidebar();

    expect(screen.getByRole("link", { name: "Dashboard" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Leave Queue" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Students" })).toBeNull();
    expect(screen.getByText("Leave Management")).toBeTruthy();
  });

  it("always shows the ungated Settings and Help links regardless of permission", () => {
    mockUseAuthorization.mockReturnValue(authValue({ hasPermission: () => false }));
    renderSidebar();
    expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Help & Support" })).toBeTruthy();
  });

  it("marks the current route active via aria-current", () => {
    mockUseAuthorization.mockReturnValue(authValue({ hasPermission: () => true }));
    renderSidebar();
    expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });
});

describe("Sidebar — collapse", () => {
  it("renders the collapse button and calls the handler on click", () => {
    mockUseAuthorization.mockReturnValue(authValue({ hasPermission: () => true }));
    const onToggleCollapsed = vi.fn();
    renderSidebar(false, onToggleCollapsed);

    fireEvent.click(screen.getByRole("button", { name: "Collapse navigation" }));
    expect(onToggleCollapsed).toHaveBeenCalled();
  });

  it("when collapsed, every item keeps a real accessible name (not blank)", () => {
    mockUseAuthorization.mockReturnValue(authValue({ hasPermission: () => true }));
    renderSidebar(true);

    const dashboardLink = screen.getByRole("link", { name: "Dashboard" });
    expect(dashboardLink).toBeTruthy();
    expect(screen.getByRole("button", { name: "Expand navigation" })).toBeTruthy();
  });

  it("hides group headings visually when collapsed but keeps items reachable", () => {
    const granted = new Set<Permission>(["leave:queue:view"]);
    mockUseAuthorization.mockReturnValue(authValue({ hasPermission: (p) => granted.has(p) }));
    renderSidebar(true);

    expect(screen.queryByText("Leave Management")).toBeNull();
    expect(screen.getByRole("link", { name: "Leave Queue" })).toBeTruthy();
  });
});
