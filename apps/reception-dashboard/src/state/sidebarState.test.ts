// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useSidebarState } from "./sidebarState";

const STORAGE_KEY = "digihostel.reception-dashboard.sidebar-collapsed";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("useSidebarState", () => {
  it("defaults to expanded (not collapsed) with no persisted preference", () => {
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.collapsed).toBe(false);
  });

  it("toggle() flips collapsed and persists the new value", () => {
    const { result } = renderHook(() => useSidebarState());
    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(true);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("true");

    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("false");
  });

  it("a fresh hook instance reads back a previously persisted preference", () => {
    window.localStorage.setItem(STORAGE_KEY, "true");
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.collapsed).toBe(true);
  });

  it("setCollapsed() sets and persists an explicit value", () => {
    const { result } = renderHook(() => useSidebarState());
    act(() => result.current.setCollapsed(true));
    expect(result.current.collapsed).toBe(true);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("true");
  });
});
