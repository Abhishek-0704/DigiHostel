// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { NotificationDetail, type NotificationDetailProps } from "./NotificationDetail";
import { useAuthorization } from "../../contexts/AuthorizationContext";
import type { Notification } from "../../features/notifications/types";

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: vi.fn(),
}));
vi.mock("../../contexts/AuthorizationContext", () => ({ useAuthorization: vi.fn() }));

const mockNavigate = vi.fn();
vi.mocked(useNavigate).mockReturnValue(mockNavigate);
const mockUseAuthorization = vi.mocked(useAuthorization);

afterEach(cleanup);

function setupAuthorization(hasPermission: (p: string) => boolean = () => true) {
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

function make(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "n1",
    title: "Leave request needs review",
    message: "Full message body.",
    category: "parent_approval",
    priority: "high",
    state: "unread",
    createdAt: "2026-01-01T00:00:00.000Z",
    source: "Leave Management",
    ...overrides,
  };
}

function renderDetail(props: Partial<NotificationDetailProps> = {}) {
  const notification = "notification" in props ? (props.notification ?? null) : make();
  return render(
    <MemoryRouter>
      <NotificationDetail
        notification={notification}
        onClose={props.onClose ?? vi.fn()}
        onMarkAsRead={props.onMarkAsRead ?? vi.fn()}
        onAcknowledge={props.onAcknowledge ?? vi.fn()}
        onDismiss={props.onDismiss ?? vi.fn()}
        onArchive={props.onArchive ?? vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe("NotificationDetail", () => {
  it("shows a clear placeholder when nothing is selected", () => {
    setupAuthorization();
    renderDetail({ notification: null });
    expect(screen.getByText("No notification selected")).toBeTruthy();
  });

  it("shows the full title, message, category, priority, and state", () => {
    setupAuthorization();
    renderDetail();
    expect(screen.getByRole("heading", { name: "Leave request needs review" })).toBeTruthy();
    expect(screen.getByText("Full message body.")).toBeTruthy();
    expect(screen.getByText("Parent Approval")).toBeTruthy();
    expect(screen.getByText("High")).toBeTruthy();
    expect(screen.getByText("Unread")).toBeTruthy();
  });

  it("calls onClose when the close button is clicked", () => {
    setupAuthorization();
    const onClose = vi.fn();
    renderDetail({ onClose });
    fireEvent.click(screen.getByRole("button", { name: "Close notification detail" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Escape from within the panel", () => {
    setupAuthorization();
    const onClose = vi.fn();
    renderDetail({ onClose });
    fireEvent.keyDown(screen.getByRole("region"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a real action button that navigates to the action's route when permitted", () => {
    setupAuthorization(() => true);
    renderDetail({
      notification: make({
        action: {
          label: "Open Leave Queue",
          route: "/leave",
          requiredPermission: "leave:queue:view",
        },
      }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Open Leave Queue" }));
    expect(mockNavigate).toHaveBeenCalledWith("/leave");
  });

  it("hides the action when the caller lacks its required permission — never grants access via the notification payload", () => {
    setupAuthorization(() => false);
    renderDetail({
      notification: make({
        action: {
          label: "Open Leave Queue",
          route: "/leave",
          requiredPermission: "leave:queue:view",
        },
      }),
    });
    expect(screen.queryByRole("button", { name: "Open Leave Queue" })).toBeNull();
  });

  it("only offers 'Mark as read' for an unread notification", () => {
    setupAuthorization();
    const { rerender } = renderDetail({ notification: make({ state: "unread" }) });
    expect(screen.getByRole("button", { name: "Mark as read" })).toBeTruthy();
    rerender(
      <MemoryRouter>
        <NotificationDetail
          notification={make({ state: "read" })}
          onClose={vi.fn()}
          onMarkAsRead={vi.fn()}
          onAcknowledge={vi.fn()}
          onDismiss={vi.fn()}
          onArchive={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("button", { name: "Mark as read" })).toBeNull();
  });

  it("dismiss and archive call their handlers with the notification's id", () => {
    setupAuthorization();
    const onDismiss = vi.fn();
    const onArchive = vi.fn();
    renderDetail({ onDismiss, onArchive });
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledWith(["n1"]);
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(onArchive).toHaveBeenCalledWith(["n1"]);
  });
});
