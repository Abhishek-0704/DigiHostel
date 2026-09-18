// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { KPITile } from "./KPITile";

afterEach(cleanup);

describe("KPITile", () => {
  it("renders a real computed value, including a genuine zero", () => {
    render(<KPITile label="Rejected in Period" value={0} />);
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.getByText("Rejected in Period")).toBeTruthy();
  });

  it("renders a loading skeleton and never shows a stale/fabricated value while loading", () => {
    render(<KPITile label="Total Students" value={10} loading />);
    expect(screen.queryByText("10")).toBeNull();
  });

  it("renders an honest unavailable reason instead of a fabricated zero when value is null", () => {
    render(
      <KPITile
        label="Approval Rate"
        value={null}
        unavailableReason="No decided requests in this period"
      />,
    );
    expect(screen.getByText("No decided requests in this period")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("falls back to a generic 'Unavailable' label when no reason is supplied", () => {
    render(<KPITile label="Something" value={null} />);
    expect(screen.getByText("Unavailable")).toBeTruthy();
  });

  it("renders a unit suffix alongside a real value", () => {
    render(<KPITile label="Avg. Parent Response Time" value={42} unit="min" />);
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText("min")).toBeTruthy();
  });
});
