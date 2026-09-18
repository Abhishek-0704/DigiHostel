import { describe, it, expect } from "vitest";
import { matchesFilters, matchesSearch, sortByOrder, applyNotificationView } from "./filtering";
import { emptyFilters } from "./types";
import type { Notification } from "./types";

function make(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "n1",
    title: "Test notification",
    message: "Test message",
    category: "system",
    priority: "medium",
    state: "unread",
    createdAt: "2026-01-01T00:00:00.000Z",
    source: "Test Source",
    ...overrides,
  };
}

describe("matchesFilters", () => {
  it("passes everything when filters are empty", () => {
    expect(matchesFilters(make(), emptyFilters())).toBe(true);
  });

  it("filters by unreadOnly", () => {
    const filters = { ...emptyFilters(), unreadOnly: true };
    expect(matchesFilters(make({ state: "unread" }), filters)).toBe(true);
    expect(matchesFilters(make({ state: "read" }), filters)).toBe(false);
  });

  it("filters by category", () => {
    const filters = { ...emptyFilters(), categories: ["emergency" as const] };
    expect(matchesFilters(make({ category: "emergency" }), filters)).toBe(true);
    expect(matchesFilters(make({ category: "system" }), filters)).toBe(false);
  });

  it("filters by priority", () => {
    const filters = { ...emptyFilters(), priorities: ["critical" as const] };
    expect(matchesFilters(make({ priority: "critical" }), filters)).toBe(true);
    expect(matchesFilters(make({ priority: "low" }), filters)).toBe(false);
  });

  it("filters by state", () => {
    const filters = { ...emptyFilters(), states: ["action_required" as const] };
    expect(matchesFilters(make({ state: "action_required" }), filters)).toBe(true);
    expect(matchesFilters(make({ state: "completed" }), filters)).toBe(false);
  });
});

describe("matchesSearch", () => {
  it("matches an empty query unconditionally", () => {
    expect(matchesSearch(make(), "")).toBe(true);
  });

  it("matches title, message, and source case-insensitively", () => {
    const n = make({ title: "Leave Request", message: "needs review", source: "Leave Management" });
    expect(matchesSearch(n, "leave")).toBe(true);
    expect(matchesSearch(n, "REVIEW")).toBe(true);
    expect(matchesSearch(n, "management")).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(matchesSearch(make({ title: "Leave Request" }), "emergency")).toBe(false);
  });
});

describe("sortByOrder", () => {
  const older = make({ id: "a", createdAt: "2026-01-01T00:00:00.000Z", priority: "low" });
  const newer = make({ id: "b", createdAt: "2026-01-02T00:00:00.000Z", priority: "critical" });

  it("sorts newest first by default", () => {
    expect(sortByOrder([older, newer], "newest").map((n) => n.id)).toEqual(["b", "a"]);
  });

  it("sorts oldest first when requested", () => {
    expect(sortByOrder([newer, older], "oldest").map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("sorts by priority weight, newest-first as tie-breaker", () => {
    expect(sortByOrder([older, newer], "priority").map((n) => n.id)).toEqual(["b", "a"]);
  });
});

describe("applyNotificationView", () => {
  it("composes filtering, search, and sorting together", () => {
    const a = make({ id: "a", category: "emergency", createdAt: "2026-01-01T00:00:00.000Z" });
    const b = make({ id: "b", category: "system", createdAt: "2026-01-02T00:00:00.000Z" });
    const result = applyNotificationView(
      [a, b],
      { ...emptyFilters(), categories: ["emergency"] },
      "",
      "newest",
    );
    expect(result.map((n) => n.id)).toEqual(["a"]);
  });
});
