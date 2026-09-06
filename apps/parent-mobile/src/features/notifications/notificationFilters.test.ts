import { describe, expect, it } from "vitest";
import { filterNotifications } from "./notificationFilters";
import type { ParentNotification } from "./notificationTypes";

function notification(overrides: Partial<ParentNotification> = {}): ParentNotification {
  return {
    id: "1",
    category: "leave_approval",
    priority: "high",
    title: "Leave request awaiting your response",
    description: "desc",
    deliveryStatus: "delivered",
    createdAt: "2026-09-01T10:00:00.000Z",
    relatedLeaveRequestId: "leave-1",
    ...overrides,
  };
}

describe("filterNotifications", () => {
  const list = [
    notification({ id: "1", category: "leave_approval", priority: "high" }),
    notification({ id: "2", category: "general", priority: "normal", relatedLeaveRequestId: null }),
  ];

  it("'all' returns every notification", () => {
    expect(filterNotifications(list, "all")).toEqual(list);
  });

  it("'unread' matches every notification (isUnread is always true today)", () => {
    expect(filterNotifications(list, "unread")).toEqual(list);
  });

  it("'read' matches nothing — no notification has ever been marked read", () => {
    expect(filterNotifications(list, "read")).toEqual([]);
  });

  it("'high_priority' matches only high-priority notifications", () => {
    expect(filterNotifications(list, "high_priority").map((n) => n.id)).toEqual(["1"]);
  });

  it("category filter matches only that category", () => {
    expect(
      filterNotifications(list, { kind: "category", category: "leave_approval" }).map((n) => n.id),
    ).toEqual(["1"]);
    expect(
      filterNotifications(list, { kind: "category", category: "general" }).map((n) => n.id),
    ).toEqual(["2"]);
  });

  it("category filter for a category with no real data returns an empty (not fabricated) result", () => {
    expect(filterNotifications(list, { kind: "category", category: "security" })).toEqual([]);
  });
});
