// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useLeaveQueueState } from "./useLeaveQueueState";
import type { LeaveQueueItem } from "./types";

afterEach(cleanup);

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

describe("useLeaveQueueState", () => {
  it("starts with empty filters/search, newest sort, and no selection", () => {
    const { result } = renderHook(() => useLeaveQueueState([]));
    expect(result.current.filters.statuses).toEqual([]);
    expect(result.current.filters.unresolvedOnly).toBe(false);
    expect(result.current.searchQuery).toBe("");
    expect(result.current.sortOrder).toBe("newest");
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.activeId).toBeNull();
  });

  it("applies search to derive visibleItems", () => {
    const items = [
      make({ id: "a", studentFullName: "Jane Doe" }),
      make({ id: "b", studentFullName: "John Roe" }),
    ];
    const { result } = renderHook(() => useLeaveQueueState(items));
    act(() => result.current.setSearchQuery("jane"));
    expect(result.current.visibleItems.map((i) => i.id)).toEqual(["a"]);
  });

  it("toggles individual selection", () => {
    const { result } = renderHook(() => useLeaveQueueState([make({ id: "a" })]));
    act(() => result.current.toggleSelect("a", true));
    expect(result.current.selectedIds.has("a")).toBe(true);
    act(() => result.current.toggleSelect("a", false));
    expect(result.current.selectedIds.has("a")).toBe(false);
  });

  it("select-all only affects currently VISIBLE (filtered) items", () => {
    const items = [make({ id: "a", status: "pending" }), make({ id: "b", status: "approved" })];
    const { result } = renderHook(() => useLeaveQueueState(items));
    act(() => result.current.setFilters({ ...result.current.filters, unresolvedOnly: true }));
    act(() => result.current.toggleSelectAllVisible(true));
    expect(result.current.selectedIds.has("a")).toBe(true);
    expect(result.current.selectedIds.has("b")).toBe(false);
  });

  it("clears selection", () => {
    const items = [make({ id: "a" }), make({ id: "b" })];
    const { result } = renderHook(() => useLeaveQueueState(items));
    act(() => result.current.toggleSelectAllVisible(true));
    expect(result.current.selectedIds.size).toBe(2);
    act(() => result.current.clearSelection());
    expect(result.current.selectedIds.size).toBe(0);
  });

  it("tracks the active (open-in-detail) request id", () => {
    const { result } = renderHook(() => useLeaveQueueState([make({ id: "a" })]));
    act(() => result.current.setActiveId("a"));
    expect(result.current.activeId).toBe("a");
    act(() => result.current.setActiveId(null));
    expect(result.current.activeId).toBeNull();
  });
});
