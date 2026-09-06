import { describe, expect, it } from "vitest";
import { sortNotifications } from "./notificationSorting";
import type { ParentNotification } from "./notificationTypes";

function notification(overrides: Partial<ParentNotification> = {}): ParentNotification {
  return {
    id: "1",
    category: "leave_approval",
    priority: "normal",
    title: "t",
    description: "d",
    deliveryStatus: "delivered",
    createdAt: "2026-09-01T10:00:00.000Z",
    relatedLeaveRequestId: null,
    ...overrides,
  };
}

describe("sortNotifications", () => {
  const older = notification({ id: "old", createdAt: "2026-08-01T00:00:00.000Z" });
  const newer = notification({ id: "new", createdAt: "2026-09-01T00:00:00.000Z" });
  const high = notification({
    id: "high",
    priority: "high",
    createdAt: "2026-08-15T00:00:00.000Z",
  });
  const list = [older, newer, high];

  it("newest orders by createdAt descending", () => {
    expect(sortNotifications(list, "newest").map((n) => n.id)).toEqual(["new", "high", "old"]);
  });

  it("oldest orders by createdAt ascending", () => {
    expect(sortNotifications(list, "oldest").map((n) => n.id)).toEqual(["old", "high", "new"]);
  });

  it("priority puts high-priority items first, newest-first within a tier", () => {
    expect(sortNotifications(list, "priority").map((n) => n.id)).toEqual(["high", "new", "old"]);
  });

  it("category orders alphabetically by category label", () => {
    const catList = [
      notification({ id: "sec", category: "security" }),
      notification({ id: "leave", category: "leave_approval" }),
    ];
    expect(sortNotifications(catList, "category").map((n) => n.id)).toEqual(["leave", "sec"]);
  });

  it("unread_first is deterministic and does not crash (all rows are equally unread today)", () => {
    const result = sortNotifications(list, "unread_first");
    expect(result).toHaveLength(3);
    expect(result.map((n) => n.id)).toEqual(["new", "high", "old"]);
  });

  it("never mutates the input array", () => {
    const input = [older, newer];
    const originalOrder = input.map((n) => n.id);
    sortNotifications(input, "oldest");
    expect(input.map((n) => n.id)).toEqual(originalOrder);
  });

  it("is deterministic across repeated calls", () => {
    const a = sortNotifications(list, "newest").map((n) => n.id);
    const b = sortNotifications(list, "newest").map((n) => n.id);
    expect(a).toEqual(b);
  });
});
