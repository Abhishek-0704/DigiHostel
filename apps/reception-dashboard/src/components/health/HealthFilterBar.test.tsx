// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { HealthFilterBar, emptyHealthCaseFilters } from "./HealthFilterBar";

afterEach(cleanup);

describe("HealthFilterBar", () => {
  it("toggles a category chip on and off, reporting aria-pressed correctly", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <HealthFilterBar filters={emptyHealthCaseFilters()} onChange={onChange} />,
    );
    const chip = screen.getByRole("button", { name: "Medical Observation" });
    expect(chip.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(chip);
    expect(onChange).toHaveBeenCalledWith({
      ...emptyHealthCaseFilters(),
      categories: ["medical_observation"],
    });

    rerender(
      <HealthFilterBar
        filters={{ ...emptyHealthCaseFilters(), categories: ["medical_observation"] }}
        onChange={onChange}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Medical Observation" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("toggles a severity chip", () => {
    const onChange = vi.fn();
    render(<HealthFilterBar filters={emptyHealthCaseFilters()} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Critical" }));
    expect(onChange).toHaveBeenCalledWith({
      ...emptyHealthCaseFilters(),
      severities: ["critical"],
    });
  });

  it("toggles a status chip", () => {
    const onChange = vi.fn();
    render(<HealthFilterBar filters={emptyHealthCaseFilters()} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Monitoring" }));
    expect(onChange).toHaveBeenCalledWith({
      ...emptyHealthCaseFilters(),
      statuses: ["monitoring"],
    });
  });

  it("toggles active-only", () => {
    const onChange = vi.fn();
    render(
      <HealthFilterBar
        filters={{ ...emptyHealthCaseFilters(), activeOnly: true }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("Active only"));
    expect(onChange).toHaveBeenCalledWith({ ...emptyHealthCaseFilters(), activeOnly: false });
  });

  it("only shows a 'Clear filters' control when a filter is active", () => {
    const { rerender } = render(
      <HealthFilterBar filters={emptyHealthCaseFilters()} onChange={vi.fn()} />,
    );
    expect(screen.queryByText("Clear filters")).toBeNull();

    rerender(
      <HealthFilterBar
        filters={{ ...emptyHealthCaseFilters(), categories: ["accident"] }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Clear filters")).toBeTruthy();
  });

  it("clear filters resets every dimension", () => {
    const onChange = vi.fn();
    render(
      <HealthFilterBar
        filters={{
          categories: ["accident"],
          severities: ["high"],
          statuses: ["new"],
          activeOnly: false,
        }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("Clear filters"));
    expect(onChange).toHaveBeenCalledWith(emptyHealthCaseFilters());
  });
});
