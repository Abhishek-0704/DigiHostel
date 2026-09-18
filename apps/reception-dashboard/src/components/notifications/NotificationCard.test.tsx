// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NotificationCard } from "./NotificationCard";
import type { Notification } from "../../features/notifications/types";

afterEach(cleanup);

function make(overrides: Partial<Notification> = {}): Notification {
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

describe("NotificationCard", () => {
  it("shows the unread indicator only for an unread notification", () => {
    const { rerender } = render(
      <ul>
        <NotificationCard
          notification={make({ state: "unread" })}
          selected={false}
          active={false}
          onSelectChange={vi.fn()}
          onOpen={vi.fn()}
        />
      </ul>,
    );
    expect(screen.getByText("Unread")).toBeTruthy();

    rerender(
      <ul>
        <NotificationCard
          notification={make({ state: "read" })}
          selected={false}
          active={false}
          onSelectChange={vi.fn()}
          onOpen={vi.fn()}
        />
      </ul>,
    );
    expect(screen.queryByText("Unread")).toBeNull();
  });

  it("shows title, message, category, priority, and source without raw metadata", () => {
    render(
      <ul>
        <NotificationCard
          notification={make()}
          selected={false}
          active={false}
          onSelectChange={vi.fn()}
          onOpen={vi.fn()}
        />
      </ul>,
    );
    expect(screen.getByText("Leave request needs review")).toBeTruthy();
    expect(screen.getByText("A leave request has entered manual verification.")).toBeTruthy();
    expect(screen.getByText("Parent Approval")).toBeTruthy();
    expect(screen.getByText("High")).toBeTruthy();
    expect(screen.getByText("Leave Management")).toBeTruthy();
  });

  it("calling onOpen happens independently of the selection checkbox", () => {
    const onOpen = vi.fn();
    const onSelectChange = vi.fn();
    render(
      <ul>
        <NotificationCard
          notification={make()}
          selected={false}
          active={false}
          onSelectChange={onSelectChange}
          onOpen={onOpen}
        />
      </ul>,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onSelectChange).toHaveBeenCalledWith(true);
    expect(onOpen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalled();
  });

  it("has an accessible name for the selection checkbox naming the notification", () => {
    render(
      <ul>
        <NotificationCard
          notification={make()}
          selected={false}
          active={false}
          onSelectChange={vi.fn()}
          onOpen={vi.fn()}
        />
      </ul>,
    );
    expect(
      screen.getByRole("checkbox", { name: "Select notification: Leave request needs review" }),
    ).toBeTruthy();
  });
});
