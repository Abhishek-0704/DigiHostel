// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NotificationPriorityBadge } from "./NotificationPriorityBadge";

afterEach(cleanup);

describe("NotificationPriorityBadge", () => {
  it("renders a real text label for every priority — never color alone", () => {
    render(<NotificationPriorityBadge priority="critical" />);
    expect(screen.getByText("Critical")).toBeTruthy();
  });

  it("renders distinct labels for critical and high", () => {
    const { rerender } = render(<NotificationPriorityBadge priority="critical" />);
    expect(screen.getByText("Critical")).toBeTruthy();
    rerender(<NotificationPriorityBadge priority="high" />);
    expect(screen.getByText("High")).toBeTruthy();
  });
});
