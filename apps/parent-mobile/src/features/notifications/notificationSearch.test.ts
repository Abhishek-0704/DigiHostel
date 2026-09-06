import { describe, expect, it } from "vitest";
import { searchNotifications } from "./notificationSearch";
import type { ParentNotification } from "./notificationTypes";

function notification(overrides: Partial<ParentNotification> = {}): ParentNotification {
  return {
    id: "1",
    category: "leave_approval",
    priority: "high",
    title: "Leave request awaiting your response",
    description: "A linked student has a pending leave request.",
    deliveryStatus: "delivered",
    createdAt: "2026-09-01T10:00:00.000Z",
    relatedLeaveRequestId: "leave-1",
    ...overrides,
  };
}

describe("searchNotifications", () => {
  const list = [
    notification({ id: "1", title: "Leave request awaiting your response" }),
    notification({
      id: "2",
      category: "general",
      title: "Notification",
      description: "Open this notification for more information.",
    }),
  ];

  it("returns everything for an empty query", () => {
    expect(searchNotifications(list, "")).toEqual(list);
    expect(searchNotifications(list, "   ")).toEqual(list);
  });

  it("matches title case-insensitively", () => {
    const result = searchNotifications(list, "LEAVE REQUEST");
    expect(result.map((n) => n.id)).toEqual(["1"]);
  });

  it("matches description text", () => {
    const result = searchNotifications(list, "pending leave request");
    expect(result.map((n) => n.id)).toEqual(["1"]);
  });

  it("matches category label", () => {
    const result = searchNotifications(list, "leave approvals");
    expect(result.map((n) => n.id)).toEqual(["1"]);
  });

  it("matches delivery status label", () => {
    const result = searchNotifications(
      [notification({ id: "3", deliveryStatus: "failed" })],
      "delivery issue",
    );
    expect(result.map((n) => n.id)).toEqual(["3"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(searchNotifications(list, "no such term exists")).toEqual([]);
  });
});
