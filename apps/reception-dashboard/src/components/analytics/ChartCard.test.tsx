// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ChartCard } from "./ChartCard";

afterEach(cleanup);

describe("ChartCard", () => {
  it("shows a loading skeleton and not the chart content while loading", () => {
    render(
      <ChartCard title="Leave Requests Over Time" loading>
        <div data-testid="chart-body">chart</div>
      </ChartCard>,
    );
    expect(screen.queryByTestId("chart-body")).toBeNull();
    expect(screen.getByLabelText("Loading Leave Requests Over Time")).toBeTruthy();
  });

  it("shows an honest error state with a retry action instead of the chart content", () => {
    const onRetry = vi.fn();
    render(
      <ChartCard
        title="Leave Requests Over Time"
        error="Could not load trend data."
        onRetry={onRetry}
      >
        <div data-testid="chart-body">chart</div>
      </ChartCard>,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Could not load trend data.")).toBeTruthy();
    expect(screen.queryByTestId("chart-body")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("shows a distinct empty state (not a fabricated zero chart) when isEmpty is true", () => {
    render(
      <ChartCard
        title="Leave Requests Over Time"
        isEmpty
        emptyMessage="No leave requests were created, approved, or rejected in this period."
      >
        <div data-testid="chart-body">chart</div>
      </ChartCard>,
    );
    expect(screen.getByText("No data for this period")).toBeTruthy();
    expect(
      screen.getByText("No leave requests were created, approved, or rejected in this period."),
    ).toBeTruthy();
    expect(screen.queryByTestId("chart-body")).toBeNull();
  });

  it("renders the chart content plus a visually-hidden accessible textual summary when data is present", () => {
    render(
      <ChartCard
        title="Leave Requests Over Time"
        accessibleSummary="Over the selected period, 5 leave requests were created."
      >
        <div data-testid="chart-body">chart</div>
      </ChartCard>,
    );
    expect(screen.getByTestId("chart-body")).toBeTruthy();
    expect(
      screen.getByText("Over the selected period, 5 leave requests were created."),
    ).toBeTruthy();
  });

  it("marks the visual chart area aria-hidden when an accessible summary is provided, so screen readers rely on the summary text", () => {
    render(
      <ChartCard title="Leave Requests Over Time" accessibleSummary="Summary text.">
        <div data-testid="chart-body">chart</div>
      </ChartCard>,
    );
    const chartArea = screen.getByTestId("chart-body").parentElement;
    expect(chartArea?.getAttribute("aria-hidden")).toBe("true");
  });
});
