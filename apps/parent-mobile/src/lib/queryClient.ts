import { QueryClient } from "@tanstack/react-query";

/**
 * TanStack Query client factory (Prompt 2 foundation). Conservative
 * defaults appropriate for a mobile client talking to a REST backend that
 * is itself the source of truth (ADR-014/ADR-016) — no feature-specific
 * query configuration lives here.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 2,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
      mutations: {
        // Security-sensitive mutations (leave decisions) must never
        // auto-retry silently — each feature that needs retry opts in
        // explicitly via src/utils/async.ts's withRetry, not this default.
        retry: false,
      },
    },
  });
}
