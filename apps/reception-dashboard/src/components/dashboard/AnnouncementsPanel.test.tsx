// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AnnouncementsPanel } from "./AnnouncementsPanel";
import { useAnnouncements } from "../../features/dashboard/useAnnouncements";

vi.mock("../../features/dashboard/useAnnouncements", () => ({ useAnnouncements: vi.fn() }));

const mockUseAnnouncements = vi.mocked(useAnnouncements);

afterEach(cleanup);

describe("AnnouncementsPanel", () => {
  it("shows the exact empty state Prompt 5 §12 specifies when no announcement service exists (current production state)", () => {
    mockUseAnnouncements.mockReturnValue({ availability: "future", items: [] });
    render(<AnnouncementsPanel />);
    expect(screen.getByText("No announcements available")).toBeTruthy();
    expect(
      screen.getByText(
        "Announcements will appear here when the announcement service is connected.",
      ),
    ).toBeTruthy();
  });

  it("renders real announcements once a future service supplies them", () => {
    mockUseAnnouncements.mockReturnValue({
      availability: "real",
      items: [
        {
          id: "a1",
          title: "Water supply maintenance",
          body: "Water will be shut off 2-4pm.",
          category: "maintenance",
          publishedAt: new Date().toISOString(),
        },
      ],
    });
    render(<AnnouncementsPanel />);
    expect(screen.getByText("Water supply maintenance")).toBeTruthy();
  });
});
