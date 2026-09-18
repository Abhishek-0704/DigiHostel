import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "../../lib/query/queryClient";
import {
  SessionProvider,
  AuthProvider,
  AuthorizationProvider,
  NotificationProvider,
  ThemeProvider,
} from "../../contexts";
import { ErrorBoundary } from "../../components/feedback";
import { ToastProvider } from "../../components/ui";

/**
 * Composition root (Prompt 0.2 §11/§20, extended Prompt 3 §17/§18) — the
 * single place every cross-cutting provider is wired together, mirroring
 * apps/parent-mobile's own provider-composition pattern. Order matters:
 * ErrorBoundary outermost (catches anything below it), then server state
 * (QueryClientProvider), then session/auth, then authorization (depends on
 * AuthContext, per Prompt 3's explicit "Authentication Context +
 * Authorization Context with clear responsibility boundaries" — nested
 * inside AuthProvider, never merged into it), then `NotificationProvider`
 * (Prompt 6 §15/§40 — the one canonical notification-state source Header's
 * unread badge and Dashboard Home's metric both read from, mounted above
 * both), then theme, then the toast layer (Prompt 4 §17/§26 — cross-cutting
 * shell UI infrastructure, innermost since it has no dependency of its own
 * and every future feature, auth-gated or not, should be able to reach
 * `useToast()`).
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <AuthProvider>
            <AuthorizationProvider>
              <NotificationProvider>
                <ThemeProvider>
                  <ToastProvider>{children}</ToastProvider>
                </ThemeProvider>
              </NotificationProvider>
            </AuthorizationProvider>
          </AuthProvider>
        </SessionProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
