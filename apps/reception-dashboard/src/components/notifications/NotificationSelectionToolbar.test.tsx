// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NotificationSelectionToolbar } from "./NotificationSelectionToolbar";

afterEach(cleanup);

function baseProps() {
  return {
    selectedCount: 2,
    onMarkAsRead: vi.fn(),
    onAcknowledge: vi.fn(),
    onDismiss: vi.fn(),
    onArchive: vi.fn(),
    onClear: vi.fn(),
  };
}

describe("NotificationSelectionToolbar", () => {
  it("renders nothing when nothing is selected", () => {
    const { container } = render(
      <NotificationSelectionToolbar {...baseProps()} selectedCount={0} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows the selected count and is an accessible toolbar", () => {
    render(<NotificationSelectionToolbar {...baseProps()} />);
    expect(screen.getByText("2 selected")).toBeTruthy();
    expect(screen.getByRole("toolbar", { name: "Bulk notification actions" })).toBeTruthy();
  });

  it("every bulk action calls its own handler", () => {
    const props = baseProps();
    render(<NotificationSelectionToolbar {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark as read" }));
    expect(props.onMarkAsRead).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
    expect(props.onAcknowledge).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(props.onDismiss).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(props.onArchive).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(props.onClear).toHaveBeenCalled();
  });
});
