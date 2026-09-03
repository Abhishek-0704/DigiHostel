import { useEffect, useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "../components/feedback/ErrorBoundary";
import { ThemeProvider } from "../contexts/ThemeContext";
import { NetworkProvider } from "../contexts/NetworkContext";
import { SessionProvider } from "../contexts/SessionContext";
import { AuthProvider } from "../contexts/AuthContext";
import { NotificationProvider } from "../contexts/NotificationContext";
import { createQueryClient } from "../lib/queryClient";
import { registerAuthTokenProvider } from "../services/api/authTokenProvider";

/**
 * Single composition root for every app-wide provider (Prompt 2
 * foundation; extended in Prompt 3 with AuthProvider). `app/_layout.tsx`
 * renders this once, wrapping the whole route tree — no route or feature
 * composes these providers itself.
 *
 * Order matters: ErrorBoundary outermost (must survive a failure in
 * anything below it) → QueryClientProvider (no dependency on theme/session)
 * → ThemeProvider (feedback components below need theme) → NetworkProvider
 * → SessionProvider (raw Supabase session) → AuthProvider (derives
 * canonical status from SessionProvider + device-trust check — must be
 * inside SessionProvider) → NotificationProvider (innermost, least
 * foundational).
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  // Registered once, outside React's render cycle — this wires the
  // generated API client's fetch mutator to the current Supabase session,
  // independent of any component's mount/unmount lifecycle.
  useEffect(() => {
    registerAuthTokenProvider();
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <NetworkProvider>
            <SessionProvider>
              <AuthProvider>
                <NotificationProvider>{children}</NotificationProvider>
              </AuthProvider>
            </SessionProvider>
          </NetworkProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
