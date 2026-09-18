// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useInactivityTimer } from "./useInactivityTimer";

// See routes/RequireAuth.test.tsx's identical comment — no `globals` in
// this workspace's vitest config, so Testing Library's auto-cleanup never
// self-registers.
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const CONFIG = { idleTimeoutMs: 10_000, warningBeforeMs: 3_000 };

describe("useInactivityTimer", () => {
  it("stays active and does not track anything when disabled", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useInactivityTimer(CONFIG, false));
    expect(result.current.status).toBe("active");
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.status).toBe("active");
  });

  it("transitions active -> warning -> expired purely from elapsed idle time", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useInactivityTimer(CONFIG, true));
    expect(result.current.status).toBe("active");

    act(() => {
      vi.advanceTimersByTime(8_000); // inside the 3s warning window before 10s
    });
    expect(result.current.status).toBe("warning");

    act(() => {
      vi.advanceTimersByTime(3_000); // past the 10s total idle timeout
    });
    expect(result.current.status).toBe("expired");
  });

  it("a tracked activity event resets the idle clock back to active", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useInactivityTimer(CONFIG, true));

    act(() => {
      vi.advanceTimersByTime(9_000);
    });
    expect(result.current.status).toBe("warning");

    act(() => {
      window.dispatchEvent(new Event("keydown"));
      vi.advanceTimersByTime(1_000); // tick the status-check interval after the reset
    });
    expect(result.current.status).toBe("active");
  });

  it("resetActivity() explicitly resets the clock the same way a tracked event does", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useInactivityTimer(CONFIG, true));

    act(() => {
      vi.advanceTimersByTime(9_500);
    });
    expect(result.current.status).toBe("warning");

    act(() => {
      result.current.resetActivity();
    });
    expect(result.current.status).toBe("active");
  });

  it("toggling enabled back on restarts tracking from a fresh clock", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ enabled }) => useInactivityTimer(CONFIG, enabled), {
      initialProps: { enabled: true },
    });

    act(() => {
      vi.advanceTimersByTime(9_500);
    });
    expect(result.current.status).toBe("warning");

    rerender({ enabled: false });
    expect(result.current.status).toBe("active");

    rerender({ enabled: true });
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current.status).toBe("active");
  });
});
