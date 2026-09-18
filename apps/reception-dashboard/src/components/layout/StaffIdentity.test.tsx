// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StaffIdentity } from "./StaffIdentity";
import { useSessionContext } from "../../contexts/SessionContext";
import { useAuthorization } from "../../contexts/AuthorizationContext";

vi.mock("../../contexts/SessionContext", () => ({ useSessionContext: vi.fn() }));
vi.mock("../../contexts/AuthorizationContext", () => ({ useAuthorization: vi.fn() }));

const mockUseSessionContext = vi.mocked(useSessionContext);
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

describe("StaffIdentity", () => {
  it("renders nothing while authorization is loading or unresolved (no flash of wrong identity)", () => {
    mockUseSessionContext.mockReturnValue({ session: null, isLoading: false, configError: false });
    mockUseAuthorization.mockReturnValue(authValue({ isAuthorizationLoading: true }));
    const { container } = render(<StaffIdentity />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the real staff name and role once resolved", () => {
    mockUseSessionContext.mockReturnValue({
      session: { user: { email: "reception1@example.test" } } as never,
      isLoading: false,
      configError: false,
    });
    mockUseAuthorization.mockReturnValue(
      authValue({
        role: "hostel_admin",
        staffName: "Test Hostel Admin",
        hostelId: "a0000000-0000-0000-0000-000000000001",
      }),
    );
    render(<StaffIdentity />);
    expect(screen.getByText("Test Hostel Admin")).toBeTruthy();
    expect(screen.getByText("Hostel Administrator")).toBeTruthy();
    expect(screen.getByText("Hostel-scoped")).toBeTruthy();
  });

  it("shows 'All hostels' for an unscoped role rather than fabricating a hostel name", () => {
    mockUseSessionContext.mockReturnValue({
      session: { user: { email: "superadmin1@example.test" } } as never,
      isLoading: false,
      configError: false,
    });
    mockUseAuthorization.mockReturnValue(
      authValue({ role: "super_admin", staffName: "Test Super Admin", hostelId: null }),
    );
    render(<StaffIdentity />);
    expect(screen.getByText("All hostels")).toBeTruthy();
  });

  it("falls back to the account email when no staff name is available", () => {
    mockUseSessionContext.mockReturnValue({
      session: { user: { email: "reception1@example.test" } } as never,
      isLoading: false,
      configError: false,
    });
    mockUseAuthorization.mockReturnValue(authValue({ role: "reception_warden", staffName: null }));
    render(<StaffIdentity />);
    expect(screen.getByText("reception1@example.test")).toBeTruthy();
  });
});
