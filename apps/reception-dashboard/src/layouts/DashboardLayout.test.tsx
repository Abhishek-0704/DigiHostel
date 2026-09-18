// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { DashboardLayout } from "./DashboardLayout";
import { useSessionContext } from "../contexts/SessionContext";
import { useAuthContext } from "../contexts/AuthContext";
import { useAuthorization } from "../contexts/AuthorizationContext";
import { useNotificationCenter } from "../contexts/NotificationContext";

vi.mock("../contexts/SessionContext", () => ({ useSessionContext: vi.fn() }));
vi.mock("../contexts/AuthContext", () => ({ useAuthContext: vi.fn() }));
vi.mock("../contexts/AuthorizationContext", () => ({ useAuthorization: vi.fn() }));
vi.mock("../contexts/NotificationContext", () => ({ useNotificationCenter: vi.fn() }));

const mockUseSessionContext = vi.mocked(useSessionContext);
const mockUseAuthContext = vi.mocked(useAuthContext);
const mockUseAuthorization = vi.mocked(useAuthorization);
const mockUseNotificationCenter = vi.mocked(useNotificationCenter);

afterEach(cleanup);

function setup() {
  mockUseSessionContext.mockReturnValue({
    session: { user: { email: "reception1@example.test" } } as never,
    isLoading: false,
    configError: false,
  });
  mockUseAuthContext.mockReturnValue({
    status: "authenticated",
    signOut: vi.fn(),
    refreshAssuranceLevel: vi.fn(),
    lastSignOutReason: null,
    inactivityStatus: "active",
    inactivityRemainingMs: 0,
    resetInactivityTimer: vi.fn(),
  });
  mockUseAuthorization.mockReturnValue({
    role: "reception_warden",
    hostelId: "a0000000-0000-0000-0000-000000000001",
    staffName: "Test Reception Warden",
    permissions: ["dashboard:view"],
    isAuthorizationLoading: false,
    isAuthorized: true,
    authorizationError: null,
    hasRole: () => false,
    hasPermission: (p) => p === "dashboard:view",
    can: () => false,
    canAccessHostel: () => false,
    refreshAuthorization: vi.fn(),
  });
  mockUseNotificationCenter.mockReturnValue({
    notifications: [],
    unreadCount: 0,
    isLoading: false,
    error: null,
    refresh: vi.fn(),
    markAsRead: vi.fn(),
    acknowledge: vi.fn(),
    dismiss: vi.fn(),
    archive: vi.fn(),
    markAllAsRead: vi.fn(),
  });
}

function renderShell() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<div>Page Content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("DashboardLayout", () => {
  it("renders every real landmark: nav, header (banner), main, footer/contentinfo", () => {
    setup();
    renderShell();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeTruthy();
    expect(screen.getByRole("banner")).toBeTruthy();
    expect(screen.getByRole("main")).toBeTruthy();
    expect(screen.getByRole("contentinfo")).toBeTruthy();
  });

  it("renders the routed page content inside <main>", () => {
    setup();
    renderShell();
    expect(screen.getByRole("main").textContent).toContain("Page Content");
  });

  it("renders a skip link pointing at the main content region", () => {
    setup();
    renderShell();
    const skipLink = screen.getByRole("link", { name: "Skip to main content" });
    expect(skipLink.getAttribute("href")).toBe("#main-content");
    expect(screen.getByRole("main").id).toBe("main-content");
  });
});
