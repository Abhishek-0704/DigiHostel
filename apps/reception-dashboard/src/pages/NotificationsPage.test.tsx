// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NotificationsPage from "./NotificationsPage";
import { useNotificationCenter } from "../contexts/NotificationContext";
import { useAuthorization } from "../contexts/AuthorizationContext";
import type { Notification } from "../features/notifications/types";

vi.mock("../contexts/NotificationContext", () => ({ useNotificationCenter: vi.fn() }));
vi.mock("../contexts/AuthorizationContext", () => ({ useAuthorization: vi.fn() }));

vi.mock("../services/realtime/realtimeClient", () => ({
  createChannel: vi.fn(() => ({
    subscribe: (callback: (status: string) => void) => {
      callback("SUBSCRIBED");
      return {};
    },
  })),
  removeChannel: vi.fn(),
}));

const mockUseNotificationCenter = vi.mocked(useNotificationCenter);
const mockUseAuthorization = vi.mocked(useAuthorization);

afterEach(cleanup);

function fixture(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "n1",
    title: "Leave request needs review",
    message: "A leave request has entered manual verification.",
    category: "parent_approval",
    priority: "high",
    state: "unread",
    createdAt: "2026-01-01T00:00:00.000Z",
    source: "Leave Management",
    ...overrides,
  };
}

function setup(
  notifications: Notification[] = [],
  overrides: Partial<ReturnType<typeof useNotificationCenter>> = {},
) {
  mockUseNotificationCenter.mockReturnValue({
    notifications,
    unreadCount: notifications.filter((n) => n.state === "unread").length,
    isLoading: false,
    error: null,
    refresh: vi.fn(),
    markAsRead: vi.fn(),
    acknowledge: vi.fn(),
    dismiss: vi.fn(),
    archive: vi.fn(),
    markAllAsRead: vi.fn(),
    ...overrides,
  });
  mockUseAuthorization.mockReturnValue({
    role: "reception_warden",
    hostelId: null,
    staffName: null,
    permissions: [],
    isAuthorizationLoading: false,
    isAuthorized: true,
    authorizationError: null,
    hasRole: () => false,
    hasPermission: () => true,
    can: () => false,
    canAccessHostel: () => false,
    refreshAuthorization: vi.fn(),
  } as never);
}

function renderPage() {
  return render(
    <MemoryRouter>
      <NotificationsPage />
    </MemoryRouter>,
  );
}

describe("NotificationsPage", () => {
  it("renders inside the shell's page template with the real title and breadcrumb", () => {
    setup([]);
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Notification Center" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeTruthy();
  });

  it("shows the honest empty state when there are no notifications at all", () => {
    setup([]);
    renderPage();
    expect(screen.getByText("You're all caught up")).toBeTruthy();
    expect(screen.getByText(/notification source is not yet connected/)).toBeTruthy();
  });

  it("lists real notifications when the canonical context has some", () => {
    setup([fixture()]);
    renderPage();
    expect(screen.getByText("Leave request needs review")).toBeTruthy();
  });

  it("search narrows the visible list", () => {
    setup([
      fixture({ id: "a", title: "Leave review" }),
      fixture({ id: "b", title: "Emergency alert" }),
    ]);
    renderPage();
    fireEvent.change(screen.getByLabelText("Search notifications"), {
      target: { value: "emergency" },
    });
    expect(screen.queryByText("Leave review")).toBeNull();
    expect(screen.getByText("Emergency alert")).toBeTruthy();
  });

  it("shows 'no notifications match these filters' distinctly from the zero-notifications empty state", () => {
    setup([fixture({ title: "Leave review" })]);
    renderPage();
    fireEvent.change(screen.getByLabelText("Search notifications"), {
      target: { value: "nonexistent" },
    });
    expect(screen.getByText("No notifications match these filters")).toBeTruthy();
  });

  it("selecting a notification opens its detail, and closing returns to the list", () => {
    setup([fixture()]);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Leave request needs review/ }));
    expect(screen.getByRole("heading", { name: "Leave request needs review" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close notification detail" }));
    expect(screen.getByText("No notification selected")).toBeTruthy();
  });

  it("selecting notifications shows the bulk-action toolbar with the correct count", () => {
    setup([fixture({ id: "a" }), fixture({ id: "b" })]);
    renderPage();
    const checkboxes = screen.getAllByRole("checkbox", { name: /^Select notification/ });
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    expect(screen.getByText("2 selected")).toBeTruthy();
  });

  it("shows 'Mark all as read' only when there is a real unread count", () => {
    setup([fixture({ state: "unread" })]);
    renderPage();
    expect(screen.getByRole("button", { name: "Mark all as read" })).toBeTruthy();
  });

  it("never renders a fabricated notification — only what the canonical context actually provides", () => {
    setup([]);
    renderPage();
    expect(screen.queryByText(/Parent approved leave/)).toBeNull();
  });
});
