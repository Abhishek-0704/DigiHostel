import { describe, expect, it } from "vitest";
import { formatNotificationTimestamp } from "./notificationFormatting";

describe("formatNotificationTimestamp", () => {
  it("formats a valid ISO timestamp with date and 24h time", () => {
    const date = new Date(2026, 8, 4, 9, 5);
    expect(formatNotificationTimestamp(date.toISOString())).toBe("4 Sep 2026, 09:05");
  });

  it("pads single-digit hours and minutes", () => {
    const date = new Date(2026, 0, 1, 1, 2);
    expect(formatNotificationTimestamp(date.toISOString())).toBe("1 Jan 2026, 01:02");
  });

  it("returns a safe fallback for an unparseable value", () => {
    expect(formatNotificationTimestamp("not-a-date")).toBe("Unknown time");
  });
});
