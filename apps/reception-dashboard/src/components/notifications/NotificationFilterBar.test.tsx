// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NotificationFilterBar } from "./NotificationFilterBar";
import { emptyFilters } from "../../features/notifications/types";

afterEach(cleanup);

describe("NotificationFilterBar", () => {
  it("toggles a priority chip on and off, reporting aria-pressed correctly", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <NotificationFilterBar filters={emptyFilters()} onChange={onChange} />,
    );
    const chip = screen.getByRole("button", { name: "Critical" });
    expect(chip.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(chip);
    expect(onChange).toHaveBeenCalledWith({ ...emptyFilters(), priorities: ["critical"] });

    rerender(
      <NotificationFilterBar
        filters={{ ...emptyFilters(), priorities: ["critical"] }}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("button", { name: "Critical" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("toggles a category chip", () => {
    const onChange = vi.fn();
    render(<NotificationFilterBar filters={emptyFilters()} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Emergency" }));
    expect(onChange).toHaveBeenCalledWith({ ...emptyFilters(), categories: ["emergency"] });
  });

  it("toggles unread-only", () => {
    const onChange = vi.fn();
    render(<NotificationFilterBar filters={emptyFilters()} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Unread only"));
    expect(onChange).toHaveBeenCalledWith({ ...emptyFilters(), unreadOnly: true });
  });

  it("only shows a 'Clear filters' control when a filter is active", () => {
    const { rerender } = render(
      <NotificationFilterBar filters={emptyFilters()} onChange={vi.fn()} />,
    );
    expect(screen.queryByText("Clear filters")).toBeNull();

    rerender(
      <NotificationFilterBar
        filters={{ ...emptyFilters(), unreadOnly: true }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Clear filters")).toBeTruthy();
  });

  it("clear filters resets every dimension", () => {
    const onChange = vi.fn();
    render(
      <NotificationFilterBar
        filters={{ ...emptyFilters(), unreadOnly: true, priorities: ["critical"] }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("Clear filters"));
    expect(onChange).toHaveBeenCalledWith(emptyFilters());
  });
});
