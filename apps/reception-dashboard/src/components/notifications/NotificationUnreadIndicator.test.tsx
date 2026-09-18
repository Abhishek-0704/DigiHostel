// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NotificationUnreadIndicator } from "./NotificationUnreadIndicator";

afterEach(cleanup);

describe("NotificationUnreadIndicator", () => {
  it("exposes a real 'Unread' text equivalent to assistive tech, not just a colored dot", () => {
    render(<NotificationUnreadIndicator />);
    expect(screen.getByText("Unread")).toBeTruthy();
  });
});
