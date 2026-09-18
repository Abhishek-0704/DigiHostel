// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NotificationList } from "./NotificationList";
import type { Notification } from "../../features/notifications/types";

afterEach(cleanup);

function make(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "n1",
    title: "Title",
    message: "Message",
    category: "system",
    priority: "medium",
    state: "unread",
    createdAt: "2026-01-01T00:00:00.000Z",
    source: "Test Source",
    ...overrides,
  };
}

describe("NotificationList", () => {
  it("shows a loading skeleton, not the empty state, while loading", () => {
    render(
      <NotificationList
        notifications={[]}
        selectedIds={new Set()}
        activeId={null}
        onToggleSelect={vi.fn()}
        onToggleSelectAll={vi.fn()}
        onOpen={vi.fn()}
        loading
        emptyTitle="You're all caught up"
      />,
    );
    expect(screen.getByLabelText("Loading notifications")).toBeTruthy();
    expect(screen.queryByText("You're all caught up")).toBeNull();
  });

  it("shows the error state with a working retry action", () => {
    const onRetry = vi.fn();
    render(
      <NotificationList
        notifications={[]}
        selectedIds={new Set()}
        activeId={null}
        onToggleSelect={vi.fn()}
        onToggleSelectAll={vi.fn()}
        onOpen={vi.fn()}
        error={{ message: "Notifications are temporarily unavailable.", onRetry }}
        emptyTitle="You're all caught up"
      />,
    );
    expect(screen.getByText("Notifications are temporarily unavailable.")).toBeTruthy();
    fireEvent.click(screen.getByText("Try again"));
    expect(onRetry).toHaveBeenCalled();
  });

  it("shows an honest, specific empty state when there are no notifications", () => {
    render(
      <NotificationList
        notifications={[]}
        selectedIds={new Set()}
        activeId={null}
        onToggleSelect={vi.fn()}
        onToggleSelectAll={vi.fn()}
        onOpen={vi.fn()}
        emptyTitle="You're all caught up"
        emptyDescription="No notifications require your attention."
      />,
    );
    expect(screen.getByText("You're all caught up")).toBeTruthy();
    expect(screen.getByText("No notifications require your attention.")).toBeTruthy();
  });

  it("renders every notification and a select-all-visible control", () => {
    const notifications = [make({ id: "a" }), make({ id: "b", title: "Second" })];
    render(
      <NotificationList
        notifications={notifications}
        selectedIds={new Set()}
        activeId={null}
        onToggleSelect={vi.fn()}
        onToggleSelectAll={vi.fn()}
        onOpen={vi.fn()}
        emptyTitle="unused"
      />,
    );
    expect(screen.getByText("Title")).toBeTruthy();
    expect(screen.getByText("Second")).toBeTruthy();
    expect(screen.getByLabelText("Select all visible notifications")).toBeTruthy();
  });

  it("select-all-visible checkbox reflects and drives selection state", () => {
    const onToggleSelectAll = vi.fn();
    const notifications = [make({ id: "a" }), make({ id: "b" })];
    render(
      <NotificationList
        notifications={notifications}
        selectedIds={new Set(["a", "b"])}
        activeId={null}
        onToggleSelect={vi.fn()}
        onToggleSelectAll={onToggleSelectAll}
        onOpen={vi.fn()}
        emptyTitle="unused"
      />,
    );
    const selectAll = screen.getByLabelText("Select all visible notifications") as HTMLInputElement;
    expect(selectAll.checked).toBe(true);
    fireEvent.click(selectAll);
    expect(onToggleSelectAll).toHaveBeenCalledWith(false);
  });
});
