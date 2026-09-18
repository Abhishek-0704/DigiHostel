import { describe, it, expect } from "vitest";
import {
  compareNotifications,
  sortNotifications,
  mergeIncomingNotification,
} from "./notificationMerge";
import type { Notification } from "./types";

function make(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "n1",
    title: "Title",
    message: "Message",
    category: "system",
    priority: "medium",
    state: "unread",
    createdAt: "2026-01-01T00:00:00.000Z",
    source: "Test Source",
    ...overrides,
  };
}

describe("compareNotifications", () => {
  it("orders newest createdAt first", () => {
    const older = make({ id: "a", createdAt: "2026-01-01T00:00:00.000Z" });
    const newer = make({ id: "b", createdAt: "2026-01-02T00:00:00.000Z" });
    expect(compareNotifications(newer, older)).toBeLessThan(0);
  });

  it("uses id as a stable tie-breaker for identical timestamps", () => {
    const a = make({ id: "a", createdAt: "2026-01-01T00:00:00.000Z" });
    const b = make({ id: "b", createdAt: "2026-01-01T00:00:00.000Z" });
    expect(compareNotifications(a, b)).toBeLessThan(0);
    expect(compareNotifications(b, a)).toBeGreaterThan(0);
  });
});

describe("sortNotifications", () => {
  it("does not mutate the input array", () => {
    const input = [make({ id: "a" }), make({ id: "b" })];
    const copy = [...input];
    sortNotifications(input);
    expect(input).toEqual(copy);
  });
});

describe("mergeIncomingNotification", () => {
  it("adds a genuinely new notification (distinct stable id)", () => {
    const existing = [make({ id: "a" })];
    const result = mergeIncomingNotification(existing, make({ id: "b" }));
    expect(result.map((n) => n.id).sort()).toEqual(["a", "b"]);
  });

  it("deduplicates strictly by id, updating the existing entry in place rather than duplicating it", () => {
    const existing = [make({ id: "a", state: "unread" })];
    const updated = make({ id: "a", state: "read" });
    const result = mergeIncomingNotification(existing, updated);
    expect(result).toHaveLength(1);
    expect(result[0].state).toBe("read");
  });

  it("does NOT deduplicate two distinct notifications that merely share a title and timestamp", () => {
    const existing = [
      make({ id: "a", title: "Same title", createdAt: "2026-01-01T00:00:00.000Z" }),
    ];
    const incoming = make({ id: "b", title: "Same title", createdAt: "2026-01-01T00:00:00.000Z" });
    const result = mergeIncomingNotification(existing, incoming);
    expect(result).toHaveLength(2);
  });

  it("keeps the merged list sorted", () => {
    const existing = [make({ id: "a", createdAt: "2026-01-01T00:00:00.000Z" })];
    const incoming = make({ id: "b", createdAt: "2026-01-03T00:00:00.000Z" });
    const result = mergeIncomingNotification(existing, incoming);
    expect(result.map((n) => n.id)).toEqual(["b", "a"]);
  });
});
