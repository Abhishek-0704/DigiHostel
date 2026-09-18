// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ReportFilterPanel } from "./ReportFilterPanel";
import type { ReportFilterDefinition } from "../../services/reports/ReportService";

afterEach(cleanup);

const FILTERS: ReportFilterDefinition[] = [
  { id: "dateRange", label: "Date range", type: "date_range" },
  { id: "statuses", label: "Status", type: "multi_select", options: ["pending", "approved"] },
];

describe("ReportFilterPanel", () => {
  it("renders a From/To date input for a date_range filter", () => {
    render(<ReportFilterPanel availableFilters={FILTERS} value={{}} onChange={() => {}} />);
    expect(screen.getByLabelText("From")).toBeTruthy();
    expect(screen.getByLabelText("To")).toBeTruthy();
  });

  it("renders a toggleable chip for each multi_select option, only that report's own declared values", () => {
    render(<ReportFilterPanel availableFilters={FILTERS} value={{}} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "pending" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "approved" })).toBeTruthy();
  });

  it("clicking an unselected chip adds it to the filter value", () => {
    const onChange = vi.fn();
    render(<ReportFilterPanel availableFilters={FILTERS} value={{}} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "approved" }));
    expect(onChange).toHaveBeenCalledWith({ statuses: ["approved"] });
  });

  it("clicking an already-selected chip removes it, clearing the key entirely once empty", () => {
    const onChange = vi.fn();
    render(
      <ReportFilterPanel
        availableFilters={FILTERS}
        value={{ statuses: ["approved"] }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "approved" }));
    expect(onChange).toHaveBeenCalledWith({ statuses: undefined });
  });

  it("changing the From date sets an ISO UTC start-of-day timestamp", () => {
    const onChange = vi.fn();
    render(<ReportFilterPanel availableFilters={FILTERS} value={{}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-01-15" } });
    expect(onChange).toHaveBeenCalledWith({ dateFrom: "2026-01-15T00:00:00.000Z" });
  });
});
