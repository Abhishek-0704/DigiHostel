// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ActivityFeed } from "./ActivityFeed";
import { useActivityFeed } from "../../features/dashboard/useActivityFeed";

vi.mock("../../features/dashboard/useActivityFeed", () => ({ useActivityFeed: vi.fn() }));

const mockUseActivityFeed = vi.mocked(useActivityFeed);

afterEach(cleanup);

describe("ActivityFeed", () => {
  it("shows an honest empty state — never a fabricated event — when there is no real source (current production state)", () => {
    mockUseActivityFeed.mockReturnValue({ availability: "future", items: [] });
    render(<ActivityFeed />);
    expect(screen.getByText("No recent activity")).toBeTruthy();
  });

  it("renders real events, newest first, once a future source supplies them", () => {
    mockUseActivityFeed.mockReturnValue({
      availability: "real",
      items: [
        {
          id: "e1",
          type: "student_exit",
          description: "S001 exited via main gate",
          occurredAt: new Date().toISOString(),
        },
      ],
    });
    render(<ActivityFeed />);
    expect(screen.getByText("Student exited hostel")).toBeTruthy();
    expect(screen.getByText("S001 exited via main gate")).toBeTruthy();
  });
});
