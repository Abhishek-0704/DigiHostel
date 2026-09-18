// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { WelcomeSection } from "./WelcomeSection";
import { useAuthorization } from "../../contexts/AuthorizationContext";

vi.mock("../../contexts/AuthorizationContext", () => ({ useAuthorization: vi.fn() }));

const mockUseAuthorization = vi.mocked(useAuthorization);

afterEach(cleanup);

function setup(overrides: Partial<ReturnType<typeof useAuthorization>> = {}) {
  mockUseAuthorization.mockReturnValue({
    role: "reception_warden",
    hostelId: "a0000000-0000-0000-0000-000000000001",
    staffName: "Test Reception Warden",
    permissions: [],
    isAuthorizationLoading: false,
    isAuthorized: true,
    authorizationError: null,
    hasRole: () => false,
    hasPermission: () => true,
    can: () => false,
    canAccessHostel: () => false,
    refreshAuthorization: vi.fn(),
    ...overrides,
  } as never);
}

describe("WelcomeSection", () => {
  it("greets the authenticated staff member by name", () => {
    setup();
    render(<WelcomeSection />);
    expect(screen.getByText(/Test Reception Warden/)).toBeTruthy();
  });

  it("shows the staff member's role", () => {
    setup();
    render(<WelcomeSection />);
    expect(screen.getByText("Reception Warden")).toBeTruthy();
  });

  it("shows an honest hostel-scope indicator, not a fabricated hostel name", () => {
    setup();
    render(<WelcomeSection />);
    expect(screen.getByText("Hostel-scoped")).toBeTruthy();
  });

  it("shows 'All hostels' for a null hostelId (super_admin)", () => {
    setup({ hostelId: null, role: "super_admin" });
    render(<WelcomeSection />);
    expect(screen.getByText("All hostels")).toBeTruthy();
  });

  it("renders nothing while authorization is still loading (fail closed, no flash)", () => {
    setup({ isAuthorizationLoading: true, role: null });
    const { container } = render(<WelcomeSection />);
    expect(container.firstChild).toBeNull();
  });

  it("does not invent shift information anywhere in its output", () => {
    setup();
    const { container } = render(<WelcomeSection />);
    expect(container.textContent).not.toMatch(/shift/i);
  });
});
