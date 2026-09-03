import type { AuthStatus } from "../../contexts/authStatus";

/**
 * Splash-screen status copy (Prompt 4A) — pure presentation text, kept
 * separate from the Splash component itself so it's independently
 * unit-testable (matching this repo's established pattern: authStatus.ts,
 * routeGuard.ts). Contains no logic, no auth decisions — just a mapping
 * from an already-derived AuthContext status to a human-readable sentence.
 *
 * `offline` and `error` are intentionally excluded — the Splash screen
 * renders a dedicated ErrorState for those (with its own recovery action),
 * not this status line.
 */
export function splashStatusMessage(status: AuthStatus): string {
  switch (status) {
    case "initializing":
      return "Restoring your secure session…";
    case "authenticating":
      return "Signing you in…";
    case "device_verification_required":
      return "Checking your device…";
    case "session_expired":
      return "Your session has expired. Redirecting to sign in…";
    case "authenticated":
      return "Welcome back…";
    case "unauthenticated":
    case "offline":
    case "error":
      return "";
  }
}
