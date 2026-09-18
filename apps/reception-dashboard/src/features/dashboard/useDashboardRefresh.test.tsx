// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useDashboardRefresh } from "./useDashboardRefresh";

afterEach(cleanup);

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useDashboardRefresh", () => {
  it("starts with generation 0 and no last-updated timestamp", () => {
    const { result } = renderHook(() => useDashboardRefresh(), { wrapper });
    expect(result.current.generation).toBe(0);
    expect(result.current.lastUpdatedAt).toBeNull();
  });

  it("bumps generation and sets a last-updated timestamp on refresh", () => {
    const { result } = renderHook(() => useDashboardRefresh(), { wrapper });
    act(() => {
      result.current.refresh();
    });
    expect(result.current.generation).toBe(1);
    expect(result.current.lastUpdatedAt).toBeInstanceOf(Date);
  });

  it("increments generation again on a second refresh", () => {
    const { result } = renderHook(() => useDashboardRefresh(), { wrapper });
    act(() => result.current.refresh());
    act(() => result.current.refresh());
    expect(result.current.generation).toBe(2);
  });
});
