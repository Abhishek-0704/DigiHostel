// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QuickActions } from "./QuickActions";
import { useAuthorization } from "../../contexts/AuthorizationContext";
import { QUICK_ACTIONS } from "../../features/dashboard";

vi.mock("../../contexts/AuthorizationContext", () => ({ useAuthorization: vi.fn() }));

const mockUseAuthorization = vi.mocked(useAuthorization);

afterEach(cleanup);

function setup(hasPermission: (p: string) => boolean) {
  mockUseAuthorization.mockReturnValue({
    role: "reception_warden",
    hostelId: null,
    staffName: null,
    permissions: [],
    isAuthorizationLoading: false,
    isAuthorized: true,
    authorizationError: null,
    hasRole: () => false,
    hasPermission: hasPermission as never,
    can: () => false,
    canAccessHostel: () => false,
    refreshAuthorization: vi.fn(),
  } as never);
}

describe("QuickActions", () => {
  it("shows every quick action when every permission is granted", () => {
    setup(() => true);
    render(
      <MemoryRouter>
        <QuickActions />
      </MemoryRouter>,
    );
    for (const action of QUICK_ACTIONS) {
      expect(screen.getByText(action.label)).toBeTruthy();
    }
  });

  it("shows an empty state — never invents authorization — when no permission is granted", () => {
    setup(() => false);
    render(
      <MemoryRouter>
        <QuickActions />
      </MemoryRouter>,
    );
    expect(screen.getByText("No quick actions available")).toBeTruthy();
    for (const action of QUICK_ACTIONS) {
      expect(screen.queryByText(action.label)).toBeNull();
    }
  });

  it("filters using the same hasPermission the rest of the app's route guards use", () => {
    const hasPermission = vi.fn(() => true);
    setup(hasPermission);
    render(
      <MemoryRouter>
        <QuickActions />
      </MemoryRouter>,
    );
    expect(hasPermission).toHaveBeenCalledWith("leave:queue:view");
  });
});
