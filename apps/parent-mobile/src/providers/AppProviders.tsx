import { useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "../components/feedback/ErrorBoundary";
import { ThemeProvider } from "../contexts/ThemeContext";
import { NetworkProvider } from "../contexts/NetworkContext";
import { SessionProvider } from "../contexts/SessionContext";
import { NotificationProvider } from "../contexts/NotificationContext";
import { createQueryClient } from "../lib/queryClient";

/**
 * Single composition root for every app-wide provider (Prompt 2
 * foundation). `app/_layout.tsx` renders this once, wrapping the whole
 * route tree — no route or feature composes these providers itself.
 *
 * Order matters: ErrorBoundary outermost (must survive a failure in
 * anything below it) → QueryClientProvider (no dependency on theme/session)
 * → ThemeProvider (feedback components below need theme) → NetworkProvider
 * → SessionProvider → NotificationProvider (innermost, least foundational).
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <NetworkProvider>
            <SessionProvider>
              <NotificationProvider>{children}</NotificationProvider>
            </SessionProvider>
          </NetworkProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
