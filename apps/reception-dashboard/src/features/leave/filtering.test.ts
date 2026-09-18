import { describe, it, expect } from "vitest";
import {
  matchesStatusFilters,
  matchesLeaveSearch,
  sortLeaveQueue,
  applyLeaveQueueView,
} from "./filtering";
import { emptyLeaveQueueFilters } from "./types";
import type { LeaveQueueItem } from "./types";

function make(overrides: Partial<LeaveQueueItem> = {}): LeaveQueueItem {
  return {
    id: "lr1",
    studentId: "s1",
    studentRollNumber: "TEST-001",
    studentFullName: "Test Student",
    studentHostelId: "h1",
    studentHostelName: "Test Hostel",
    studentRoomId: "r1",
    studentRoomNumber: "101",
    reason: "Family function",
    startDate: "2026-01-10",
    endDate: "2026-01-12",
    status: "pending",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("matchesStatusFilters", () => {
  it("passes everything when filters are empty", () => {
    expect(matchesStatusFilters(make(), emptyLeaveQueueFilters())).toBe(true);
  });

  it("filters by status", () => {
    const filters = { ...emptyLeaveQueueFilters(), statuses: ["pending" as const] };
    expect(matchesStatusFilters(make({ status: "pending" }), filters)).toBe(true);
    expect(matchesStatusFilters(make({ status: "approved" }), filters)).toBe(false);
  });

  it("unresolvedOnly excludes terminal statuses", () => {
    const filters = { ...emptyLeaveQueueFilters(), unresolvedOnly: true };
    expect(matchesStatusFilters(make({ status: "pending" }), filters)).toBe(true);
    expect(matchesStatusFilters(make({ status: "approved" }), filters)).toBe(false);
    expect(matchesStatusFilters(make({ status: "rejected" }), filters)).toBe(false);
    expect(matchesStatusFilters(make({ status: "expired" }), filters)).toBe(false);
  });

  it("composes status and unresolvedOnly with AND", () => {
    const filters = {
      statuses: ["approved" as const],
      unresolvedOnly: true,
    };
    // approved matches the status filter but is terminal -> excluded overall
    expect(matchesStatusFilters(make({ status: "approved" }), filters)).toBe(false);
  });
});

describe("matchesLeaveSearch", () => {
  it("matches an empty query unconditionally", () => {
    expect(matchesLeaveSearch(make(), "")).toBe(true);
  });

  it("matches student name, roll number, hostel, room, and reason case-insensitively", () => {
    const item = make({
      studentFullName: "Jane Doe",
      studentRollNumber: "KIIT-042",
      studentHostelName: "Kalinga",
      studentRoomNumber: "305",
      reason: "Medical appointment",
    });
    expect(matchesLeaveSearch(item, "jane")).toBe(true);
    expect(matchesLeaveSearch(item, "kiit-042")).toBe(true);
    expect(matchesLeaveSearch(item, "KALINGA")).toBe(true);
    expect(matchesLeaveSearch(item, "305")).toBe(true);
    expect(matchesLeaveSearch(item, "medical")).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(matchesLeaveSearch(make({ studentFullName: "Jane Doe" }), "unrelated")).toBe(false);
  });

  it("handles a null hostel/room gracefully", () => {
    const item = make({ studentHostelName: null, studentRoomNumber: null });
    expect(matchesLeaveSearch(item, "test student")).toBe(true);
  });
});

describe("sortLeaveQueue", () => {
  const now = new Date("2026-01-05T00:00:00.000Z");
  const older = make({ id: "a", createdAt: "2026-01-01T00:00:00.000Z", studentFullName: "Bob" });
  const newer = make({ id: "b", createdAt: "2026-01-02T00:00:00.000Z", studentFullName: "Amy" });

  it("sorts newest first by default", () => {
    expect(sortLeaveQueue([older, newer], "newest", now).map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("sorts oldest first when requested", () => {
    expect(sortLeaveQueue([newer, older], "oldest", now).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("sorts by longest waiting time first", () => {
    expect(sortLeaveQueue([newer, older], "waiting_time", now).map((i) => i.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("sorts by student name alphabetically", () => {
    expect(sortLeaveQueue([older, newer], "student_name", now).map((i) => i.id)).toEqual([
      "b",
      "a",
    ]);
  });

  it("applies a stable id tie-breaker when the primary key is equal", () => {
    const sameTime = "2026-01-01T00:00:00.000Z";
    const x = make({ id: "x", createdAt: sameTime });
    const y = make({ id: "y", createdAt: sameTime });
    expect(sortLeaveQueue([y, x], "newest", now).map((i) => i.id)).toEqual(["x", "y"]);
  });
});

describe("applyLeaveQueueView", () => {
  it("composes filtering, search, and sorting together", () => {
    const now = new Date("2026-01-05T00:00:00.000Z");
    const a = make({ id: "a", status: "pending", createdAt: "2026-01-01T00:00:00.000Z" });
    const b = make({ id: "b", status: "approved", createdAt: "2026-01-02T00:00:00.000Z" });
    const result = applyLeaveQueueView(
      [a, b],
      { statuses: [], unresolvedOnly: true },
      "",
      "newest",
      now,
    );
    expect(result.map((i) => i.id)).toEqual(["a"]);
  });
});
