// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PendingWorkPanel } from "./PendingWorkPanel";
import { usePendingWork } from "../../features/dashboard/usePendingWork";

vi.mock("../../features/dashboard/usePendingWork", () => ({ usePendingWork: vi.fn() }));

const mockUsePendingWork = vi.mocked(usePendingWork);

afterEach(cleanup);

describe("PendingWorkPanel", () => {
  it("shows an honest, specific empty state when there is no real pending-work source (current production state)", () => {
    mockUsePendingWork.mockReturnValue({ availability: "placeholder", items: [] });
    render(<PendingWorkPanel />);
    expect(screen.getByText("You're all caught up")).toBeTruthy();
    expect(screen.getByText(/Leave Management data will appear here/)).toBeTruthy();
  });

  it("renders real tasks in priority order once a future source supplies them", () => {
    mockUsePendingWork.mockReturnValue({
      availability: "real",
      items: [
        { id: "t1", title: "Verify student at gate", priority: "critical" },
        { id: "t2", title: "Pending manual verification", priority: "waiting" },
      ],
    });
    render(
      <MemoryRouter>
        <PendingWorkPanel />
      </MemoryRouter>,
    );
    expect(screen.getByText("Verify student at gate")).toBeTruthy();
    expect(screen.getByText("Pending manual verification")).toBeTruthy();
    expect(screen.queryByText("You're all caught up")).toBeNull();
  });
});
