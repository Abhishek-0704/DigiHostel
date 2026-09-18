// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useCurrentDateTime } from "./useCurrentDateTime";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useCurrentDateTime", () => {
  it("returns a Date", () => {
    const { result } = renderHook(() => useCurrentDateTime());
    expect(result.current).toBeInstanceOf(Date);
  });

  it("updates after the configured interval elapses", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCurrentDateTime(1000));
    const first = result.current;
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.getTime()).toBeGreaterThan(first.getTime());
  });

  it("does not update before the interval elapses", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCurrentDateTime(60_000));
    const first = result.current;
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.getTime()).toBe(first.getTime());
  });
});
