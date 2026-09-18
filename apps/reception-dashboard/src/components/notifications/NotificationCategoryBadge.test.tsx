// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NotificationCategoryBadge } from "./NotificationCategoryBadge";

afterEach(cleanup);

describe("NotificationCategoryBadge", () => {
  it("renders the category's real label", () => {
    render(<NotificationCategoryBadge category="parent_approval" />);
    expect(screen.getByText("Parent Approval")).toBeTruthy();
  });
});
