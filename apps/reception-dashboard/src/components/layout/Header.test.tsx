// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Header } from "./Header";
import { useSessionContext } from "../../contexts/SessionContext";
import { useAuthContext } from "../../contexts/AuthContext";
import { useAuthorization } from "../../contexts/AuthorizationContext";
import { useNotificationCenter } from "../../contexts/NotificationContext";

vi.mock("../../contexts/SessionContext", () => ({ useSessionContext: vi.fn() }));
vi.mock("../../contexts/AuthContext", () => ({ useAuthContext: vi.fn() }));
vi.mock("../../contexts/AuthorizationContext", () => ({ useAuthorization: vi.fn() }));
vi.mock("../../contexts/NotificationContext", () => ({ useNotificationCenter: vi.fn() }));

const mockUseSessionContext = vi.mocked(useSessionContext);
const mockUseAuthContext = vi.mocked(useAuthContext);
const mockUseAuthorization = vi.mocked(useAuthorization);
const mockUseNotificationCenter = vi.mocked(useNotificationCenter);

afterEach(cleanup);

const signOut = vi.fn();

function setupMocks(
  overrides: {
    hasPermission?: (p: string) => boolean;
    role?: "reception_warden" | null;
    unreadCount?: number;
  } = {},
) {
  mockUseSessionContext.mockReturnValue({
    session: { user: { email: "reception1@example.test" } } as never,
    isLoading: false,
    configError: false,
  });
  mockUseAuthContext.mockReturnValue({
    status: "authenticated",
    signOut,
    refreshAssuranceLevel: vi.fn(),
    lastSignOutReason: null,
    inactivityStatus: "active",
    inactivityRemainingMs: 0,
    resetInactivityTimer: vi.fn(),
  });
  mockUseAuthorization.mockReturnValue({
    role: overrides.role ?? "reception_warden",
    hostelId: "a0000000-0000-0000-0000-000000000001",
    staffName: "Test Reception Warden",
    permissions: [],
    isAuthorizationLoading: false,
    isAuthorized: true,
    authorizationError: null,
    hasRole: () => false,
    hasPermission: (overrides.hasPermission ?? (() => true)) as never,
    can: () => false,
    canAccessHostel: () => false,
    refreshAuthorization: vi.fn(),
  });
  mockUseNotificationCenter.mockReturnValue({
    notifications: [],
    unreadCount: overrides.unreadCount ?? 0,
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

function renderHeader(onToggleSidebar = vi.fn()) {
  return render(
    <MemoryRouter>
      <Header onToggleSidebar={onToggleSidebar} />
    </MemoryRouter>,
  );
}

describe("Header", () => {
  it("shows the institutional title and the staff identity", () => {
    setupMocks();
    renderHeader();
    expect(screen.getByText("Reception Dashboard")).toBeTruthy();
    expect(screen.getByText("Test Reception Warden")).toBeTruthy();
    expect(screen.getByText("Reception Warden")).toBeTruthy();
  });

  it("calls onToggleSidebar when the menu button is clicked", () => {
    setupMocks();
    const onToggleSidebar = vi.fn();
    renderHeader(onToggleSidebar);
    fireEvent.click(screen.getByRole("button", { name: "Toggle navigation" }));
    expect(onToggleSidebar).toHaveBeenCalled();
  });

  it("shows the notifications link only when the caller has notifications:view", () => {
    setupMocks({ hasPermission: () => true });
    renderHeader();
    expect(screen.getByRole("link", { name: "Notifications" })).toBeTruthy();
  });

  it("hides the notifications link when the caller lacks the permission", () => {
    setupMocks({ hasPermission: () => false });
    renderHeader();
    expect(screen.queryByRole("link", { name: "Notifications" })).toBeNull();
  });

  it("shows the real canonical unread count from NotificationContext on the bell — never a second, independently-computed count", () => {
    setupMocks({ hasPermission: () => true, unreadCount: 3 });
    renderHeader();
    expect(screen.getByRole("link", { name: "3 unread notifications" })).toBeTruthy();
  });

  it("the search placeholder is present but genuinely disabled — not a fake working control", () => {
    setupMocks();
    renderHeader();
    const search = screen.getByRole("button", { name: "Search (coming soon)" });
    expect((search as HTMLButtonElement).disabled).toBe(true);
  });

  it("opens the profile menu and signs out through the existing session lifecycle", () => {
    setupMocks();
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalled();
  });
});
