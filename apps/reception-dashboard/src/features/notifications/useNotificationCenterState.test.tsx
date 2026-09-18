// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useNotificationCenterState } from "./useNotificationCenterState";
import type { Notification } from "./types";

afterEach(cleanup);

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

describe("useNotificationCenterState", () => {
  it("starts with empty filters/search, newest sort, and no selection", () => {
    const { result } = renderHook(() => useNotificationCenterState([]));
    expect(result.current.filters.categories).toEqual([]);
    expect(result.current.searchQuery).toBe("");
    expect(result.current.sortOrder).toBe("newest");
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.activeId).toBeNull();
  });

  it("applies search to derive visibleNotifications", () => {
    const notifications = [
      make({ id: "a", title: "Leave" }),
      make({ id: "b", title: "Emergency" }),
    ];
    const { result } = renderHook(() => useNotificationCenterState(notifications));
    act(() => result.current.setSearchQuery("leave"));
    expect(result.current.visibleNotifications.map((n) => n.id)).toEqual(["a"]);
  });

  it("toggles individual selection", () => {
    const { result } = renderHook(() => useNotificationCenterState([make({ id: "a" })]));
    act(() => result.current.toggleSelect("a", true));
    expect(result.current.selectedIds.has("a")).toBe(true);
    act(() => result.current.toggleSelect("a", false));
    expect(result.current.selectedIds.has("a")).toBe(false);
  });

  it("selects and clears all visible notifications", () => {
    const notifications = [make({ id: "a" }), make({ id: "b" })];
    const { result } = renderHook(() => useNotificationCenterState(notifications));
    act(() => result.current.toggleSelectAllVisible(true));
    expect(result.current.selectedIds.size).toBe(2);
    act(() => result.current.clearSelection());
    expect(result.current.selectedIds.size).toBe(0);
  });

  it("select-all only affects currently VISIBLE (filtered) notifications", () => {
    const notifications = [
      make({ id: "a", category: "emergency" }),
      make({ id: "b", category: "system" }),
    ];
    const { result } = renderHook(() => useNotificationCenterState(notifications));
    act(() => result.current.setFilters({ ...result.current.filters, categories: ["emergency"] }));
    act(() => result.current.toggleSelectAllVisible(true));
    expect(result.current.selectedIds.has("a")).toBe(true);
    expect(result.current.selectedIds.has("b")).toBe(false);
  });

  it("tracks the active (open-in-detail) notification id", () => {
    const { result } = renderHook(() => useNotificationCenterState([make({ id: "a" })]));
    act(() => result.current.setActiveId("a"));
    expect(result.current.activeId).toBe("a");
    act(() => result.current.setActiveId(null));
    expect(result.current.activeId).toBeNull();
  });
});
