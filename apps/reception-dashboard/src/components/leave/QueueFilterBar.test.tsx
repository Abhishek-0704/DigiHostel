// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueueFilterBar } from "./QueueFilterBar";
import { emptyLeaveQueueFilters } from "../../features/leave";

afterEach(cleanup);

describe("QueueFilterBar", () => {
  it("toggles a status chip on and off, reporting aria-pressed correctly", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <QueueFilterBar filters={emptyLeaveQueueFilters()} onChange={onChange} />,
    );
    const chip = screen.getByRole("button", { name: "Pending" });
    expect(chip.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(chip);
    expect(onChange).toHaveBeenCalledWith({ ...emptyLeaveQueueFilters(), statuses: ["pending"] });

    rerender(
      <QueueFilterBar
        filters={{ ...emptyLeaveQueueFilters(), statuses: ["pending"] }}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("button", { name: "Pending" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("toggles unresolved-only", () => {
    const onChange = vi.fn();
    render(<QueueFilterBar filters={emptyLeaveQueueFilters()} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Unresolved only"));
    expect(onChange).toHaveBeenCalledWith({ ...emptyLeaveQueueFilters(), unresolvedOnly: true });
  });

  it("only shows a 'Clear filters' control when a filter is active", () => {
    const { rerender } = render(
      <QueueFilterBar filters={emptyLeaveQueueFilters()} onChange={vi.fn()} />,
    );
    expect(screen.queryByText("Clear filters")).toBeNull();

    rerender(
      <QueueFilterBar
        filters={{ ...emptyLeaveQueueFilters(), unresolvedOnly: true }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Clear filters")).toBeTruthy();
  });

  it("clear filters resets every dimension", () => {
    const onChange = vi.fn();
    render(
      <QueueFilterBar
        filters={{ statuses: ["pending"], unresolvedOnly: true }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("Clear filters"));
    expect(onChange).toHaveBeenCalledWith(emptyLeaveQueueFilters());
  });

  it("never renders a filter chip for a field with no authoritative source (e.g. Priority)", () => {
    render(<QueueFilterBar filters={emptyLeaveQueueFilters()} onChange={vi.fn()} />);
    expect(screen.queryByText("Priority")).toBeNull();
  });
});
