// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { MetricCard } from "./MetricCard";
import { DashboardIcon } from "../icons";
import type { MetricCardData } from "../../features/dashboard";

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mocked(useNavigate).mockReturnValue(mockNavigate);

afterEach(cleanup);

const placeholderMetric: MetricCardData = {
  id: "test-metric",
  label: "Pending Parent Approvals",
  value: null,
  availability: "placeholder",
  unavailableReason: "Awaiting Leave Management integration (Phase 3)",
  tone: "neutral",
  icon: DashboardIcon,
  route: "/leave",
  requiredPermission: "leave:queue:view",
};

const realMetric: MetricCardData = {
  ...placeholderMetric,
  id: "real-metric",
  value: 7,
  availability: "real",
  unavailableReason: undefined,
};

describe("MetricCard", () => {
  it("shows an honest unavailable reason instead of a fabricated number", () => {
    render(
      <MemoryRouter>
        <MetricCard data={placeholderMetric} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Awaiting Leave Management integration/)).toBeTruthy();
    expect(screen.queryByText(/^\d+$/)).toBeNull();
  });

  it("shows the real value when one is provided", () => {
    render(
      <MemoryRouter>
        <MetricCard data={realMetric} />
      </MemoryRouter>,
    );
    expect(screen.getByText("7")).toBeTruthy();
  });

  it("navigates to the metric's route when clicked", () => {
    render(
      <MemoryRouter>
        <MetricCard data={placeholderMetric} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(mockNavigate).toHaveBeenCalledWith("/leave");
  });

  it("has a meaningful accessible name", () => {
    render(
      <MemoryRouter>
        <MetricCard data={placeholderMetric} />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("button", {
        name: /Pending Parent Approvals.*Awaiting Leave Management integration/,
      }),
    ).toBeTruthy();
  });
});
