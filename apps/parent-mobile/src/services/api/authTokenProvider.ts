import { setAuthTokenProvider } from "@digihostel/api-client-react";
import { authService } from "../supabase/auth";

/**
 * Wires this app's Supabase session into the generated API client's
 * fetch mutator (packages/api-client-react/src/custom-fetch.ts) — the one
 * sanctioned place a Bearer token is attached to a backend request. No
 * screen or feature hook ever reads or attaches a token itself.
 *
 * Called once during app bootstrap (src/providers/AppProviders.tsx).
 * Never logs, exposes, or stores the token itself — only passes it through.
 */
export function registerAuthTokenProvider(): void {
  setAuthTokenProvider(() => authService.getAccessToken());
}
