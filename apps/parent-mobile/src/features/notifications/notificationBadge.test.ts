import { describe, expect, it } from "vitest";
import { deriveNotificationBadge } from "./notificationBadge";

describe("deriveNotificationBadge", () => {
  it("zero notifications", () => {
    expect(deriveNotificationBadge([])).toEqual({
      count: 0,
      accessibilityLabel: "No notifications",
    });
  });

  it("one notification", () => {
    expect(deriveNotificationBadge([{}])).toEqual({
      count: 1,
      accessibilityLabel: "1 notification",
    });
  });

  it("multiple notifications", () => {
    expect(deriveNotificationBadge([{}, {}, {}])).toEqual({
      count: 3,
      accessibilityLabel: "3 notifications",
    });
  });

  it("unavailable count (null — query not yet loaded or failed)", () => {
    expect(deriveNotificationBadge(null)).toEqual({
      count: null,
      accessibilityLabel: "Notification count unavailable",
    });
  });
});
