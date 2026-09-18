// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { EmergencyFilterBar, emptyEmergencyFilters } from "./EmergencyFilterBar";

afterEach(cleanup);

describe("EmergencyFilterBar", () => {
  it("toggles a category chip on and off, reporting aria-pressed correctly", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <EmergencyFilterBar filters={emptyEmergencyFilters()} onChange={onChange} />,
    );
    const chip = screen.getByRole("button", { name: "Medical" });
    expect(chip.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(chip);
    expect(onChange).toHaveBeenCalledWith({
      ...emptyEmergencyFilters(),
      categories: ["medical"],
    });

    rerender(
      <EmergencyFilterBar
        filters={{ ...emptyEmergencyFilters(), categories: ["medical"] }}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("button", { name: "Medical" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("toggles a severity chip", () => {
    const onChange = vi.fn();
    render(<EmergencyFilterBar filters={emptyEmergencyFilters()} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Critical" }));
    expect(onChange).toHaveBeenCalledWith({
      ...emptyEmergencyFilters(),
      severities: ["critical"],
    });
  });

  it("toggles a status chip", () => {
    const onChange = vi.fn();
    render(<EmergencyFilterBar filters={emptyEmergencyFilters()} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Resolved" }));
    expect(onChange).toHaveBeenCalledWith({
      ...emptyEmergencyFilters(),
      statuses: ["resolved"],
    });
  });

  it("toggles active-only", () => {
    const onChange = vi.fn();
    render(
      <EmergencyFilterBar
        filters={{ ...emptyEmergencyFilters(), activeOnly: true }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("Active only"));
    expect(onChange).toHaveBeenCalledWith({ ...emptyEmergencyFilters(), activeOnly: false });
  });

  it("only shows a 'Clear filters' control when a filter is active", () => {
    const { rerender } = render(
      <EmergencyFilterBar filters={emptyEmergencyFilters()} onChange={vi.fn()} />,
    );
    expect(screen.queryByText("Clear filters")).toBeNull();

    rerender(
      <EmergencyFilterBar
        filters={{ ...emptyEmergencyFilters(), categories: ["fire"] }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Clear filters")).toBeTruthy();
  });

  it("clear filters resets every dimension", () => {
    const onChange = vi.fn();
    render(
      <EmergencyFilterBar
        filters={{
          categories: ["fire"],
          severities: ["high"],
          statuses: ["open"],
          activeOnly: false,
        }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("Clear filters"));
    expect(onChange).toHaveBeenCalledWith(emptyEmergencyFilters());
  });
});
