import type { Href } from "expo-router";
import type { AuthStatus } from "../contexts/authStatus";

/**
 * Pure route-protection decision logic (Prompt 3) — separated from
 * AuthGate.tsx's React/expo-router wiring for the same reason as
 * src/contexts/authStatus.ts: independently unit-testable under Vitest.
 *
 * Protected routing is a UX/navigation mechanism only. The backend
 * (Fastify guards + RLS) remains the actual security boundary regardless
 * of what this module decides — see apps/parent-mobile/docs/authentication.md.
 */

export type RouteGroup = "(auth)" | "(onboarding)" | "(app)";

/** Which top-level segment group corresponds to a given status. `undefined`
 * means "don't redirect" — the status is indeterminate (initializing,
 * authenticating) or has no single correct destination (offline, error —
 * the current screen should render its own error/offline UI instead of
 * being yanked away from what the user was looking at). */
const GROUP_FOR_STATUS: Partial<Record<AuthStatus, RouteGroup>> = {
  unauthenticated: "(auth)",
  session_expired: "(auth)",
  device_verification_required: "(onboarding)",
  authenticated: "(app)",
};

const ENTRY_PATH_FOR_GROUP: Record<RouteGroup, Href> = {
  "(auth)": "/(auth)/welcome",
  "(onboarding)": "/(onboarding)/devices",
  "(app)": "/(app)/(tabs)",
};

/**
 * Given the current status and the app's current top-level route segment
 * (from `useSegments()[0]`, `undefined` at the root `/` splash route),
 * returns the path to redirect to, or `null` if no redirect is needed.
 *
 * Redirect-loop prevention: returns `null` whenever `currentGroup` already
 * equals the target group — this is what lets a user navigate freely
 * within `(auth)`'s own sub-screens (welcome → login → otp) without this
 * guard fighting that navigation on every render.
 */
export function resolveRedirect(status: AuthStatus, currentGroup: string | undefined): Href | null {
  const targetGroup = GROUP_FOR_STATUS[status];
  if (!targetGroup) return null;
  if (currentGroup === targetGroup) return null;
  return ENTRY_PATH_FOR_GROUP[targetGroup];
}
