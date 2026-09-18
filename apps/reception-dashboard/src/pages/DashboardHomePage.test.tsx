// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DashboardHomePage from "./DashboardHomePage";
import { useAuthorization } from "../contexts/AuthorizationContext";
import { useAuthContext } from "../contexts/AuthContext";
import { useNotificationCenter } from "../contexts/NotificationContext";
import { ToastProvider } from "../components/ui";

vi.mock("../contexts/AuthorizationContext", () => ({ useAuthorization: vi.fn() }));
vi.mock("../contexts/AuthContext", () => ({ useAuthContext: vi.fn() }));
vi.mock("../contexts/NotificationContext", () => ({ useNotificationCenter: vi.fn() }));

// The generic realtime-channel lifecycle (Prompt 0.2 §19) talks to a real
// Supabase client by default — mocked here exactly like any other realtime
// consumer's test would, so this page test never needs a live Supabase
// instance. `subscribe` resolves synchronously to "SUBSCRIBED" so the page
// renders in its final, settled state without waiting on a real socket.
vi.mock("../services/realtime/realtimeClient", () => ({
  createChannel: vi.fn(() => ({
    subscribe: (callback: (status: string) => void) => {
      callback("SUBSCRIBED");
      return {};
    },
  })),
  removeChannel: vi.fn(),
}));

const mockUseAuthorization = vi.mocked(useAuthorization);
const mockUseAuthContext = vi.mocked(useAuthContext);
const mockUseNotificationCenter = vi.mocked(useNotificationCenter);

afterEach(cleanup);

function setupMocks(hasPermission: (p: string) => boolean = () => true) {
  mockUseAuthorization.mockReturnValue({
    role: "reception_warden",
    hostelId: "a0000000-0000-0000-0000-000000000001",
    staffName: "Test Reception Warden",
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
  mockUseAuthContext.mockReturnValue({
    status: "authenticated",
    signOut: vi.fn(),
    refreshAssuranceLevel: vi.fn(),
    lastSignOutReason: null,
    inactivityStatus: "active",
    inactivityRemainingMs: 0,
    resetInactivityTimer: vi.fn(),
  } as never);
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

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ToastProvider>
          <DashboardHomePage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("DashboardHomePage", () => {
  it("renders inside the Prompt 4 page-template shell with the Dashboard title", () => {
    setupMocks();
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeTruthy();
  });

  it("renders the welcome section with the real staff identity", () => {
    setupMocks();
    renderPage();
    expect(screen.getByText(/Test Reception Warden/)).toBeTruthy();
  });

  it("renders Operational Summary, Quick Actions, Pending Work, Recent Activity, Announcements, and System Health", () => {
    setupMocks();
    renderPage();
    expect(screen.getByRole("heading", { name: "Operational Summary" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Quick Actions" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Pending Work" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Recent Activity" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Announcements" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "System Health" })).toBeTruthy();
  });

  it("renders the live status bar with a real connectivity/realtime reading", () => {
    setupMocks();
    renderPage();
    expect(screen.getByText("Online")).toBeTruthy();
    expect(screen.getByText("Live")).toBeTruthy();
  });

  it("hides Quick Actions and Operational Summary metrics the caller lacks permission for", () => {
    setupMocks(() => false);
    renderPage();
    expect(screen.getByText("No quick actions available")).toBeTruthy();
    expect(screen.queryByText("Pending Parent Approvals")).toBeNull();
  });

  it("provides a working manual refresh control", () => {
    setupMocks();
    renderPage();
    expect(screen.getByRole("button", { name: /Refresh/ })).toBeTruthy();
  });

  it("never renders a fabricated production-looking number — only the genuinely real Active Notifications count", () => {
    setupMocks();
    renderPage();
    // Every other Operational Summary metric is placeholder/future today
    // (see operationalSummary.ts) and must show no digit at all. Active
    // Notifications is the one real metric (Prompt 6, sourced from
    // NotificationContext) and legitimately renders "0" — not a fabrication.
    const digitTexts = screen.queryAllByText(/^\d+$/).map((el) => el.textContent);
    expect(digitTexts).toEqual(["0"]);
  });
});
