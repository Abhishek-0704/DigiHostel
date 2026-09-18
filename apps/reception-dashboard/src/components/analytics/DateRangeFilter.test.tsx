// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { DateRangeFilter } from "./DateRangeFilter";

afterEach(cleanup);

describe("DateRangeFilter", () => {
  it("marks the currently selected preset with aria-pressed=true and the others false", () => {
    render(<DateRangeFilter value="30d" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Last 30 days" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "Last 7 days" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(screen.getByRole("button", { name: "Last 90 days" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("calls onChange with the clicked preset's id", () => {
    const onChange = vi.fn();
    render(<DateRangeFilter value="7d" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Last 90 days" }));
    expect(onChange).toHaveBeenCalledWith("90d");
  });

  it("exposes the control as a labeled group for assistive technology", () => {
    render(<DateRangeFilter value="7d" onChange={() => {}} />);
    expect(screen.getByRole("group", { name: "Select date range" })).toBeTruthy();
  });
});
