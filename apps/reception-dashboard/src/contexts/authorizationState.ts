import type { StaffProfile } from "../services/auth/staffProfileService";
import type { AuthStatus } from "./authStatus";

/**
 * Pure authorization-state derivation (Prompt 3 §17), kept separate from
 * AuthorizationContext.tsx so it's unit-testable without React — mirrors
 * authStatus.ts's own separation of concerns exactly.
 *
 * Authorization state is deliberately kept SEPARATE from authentication
 * state (§17): this derivation only ever activates once the authentication
 * layer (`AuthStatus`) already reports `"authenticated"` — a session that
 * isn't yet password+MFA-verified has no authorization to resolve at all,
 * and this derivation reflects that as "not loading, not authorized,
 * staff: null" rather than attempting a fetch.
 */
export interface AuthorizationState {
  isAuthorizationLoading: boolean;
  staff: StaffProfile | null;
  /** True only once a staff profile with a real role has been resolved.
   * `false` for every other state — no profile yet, profile fetch failed,
   * or the signed-in account has no staff row at all — fail closed by
   * construction, never defaults to true. */
  isAuthorized: boolean;
}

export function deriveAuthorizationState(input: {
  authStatus: AuthStatus;
  profileLoading: boolean;
  staff: StaffProfile | null | undefined;
}): AuthorizationState {
  if (input.authStatus !== "authenticated") {
    return { isAuthorizationLoading: false, staff: null, isAuthorized: false };
  }

  if (input.profileLoading || input.staff === undefined) {
    return { isAuthorizationLoading: true, staff: null, isAuthorized: false };
  }

  if (input.staff === null) {
    // Authenticated, MFA-verified, but no staff row exists for this
    // account — a real, expected, fail-closed state (staffProfileService's
    // own doc comment), not an error.
    return { isAuthorizationLoading: false, staff: null, isAuthorized: false };
  }

  return { isAuthorizationLoading: false, staff: input.staff, isAuthorized: true };
}
