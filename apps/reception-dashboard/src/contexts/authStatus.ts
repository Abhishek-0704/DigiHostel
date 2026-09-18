/**
 * Pure auth-status derivation logic (Prompt 0.2), kept separate from
 * AuthContext.tsx so it's unit-testable without React — mirrors
 * apps/parent-mobile/src/contexts/authStatus.ts's separation of concerns.
 *
 * Password + MFA is an ACCEPTED requirement for staff authentication
 * (docs/adr/ADR-024) — this derivation distinguishes the exact states
 * Prompt 0.2 §13 requires:
 *   - unauthenticated: no Supabase session at all.
 *   - mfa_required: a session exists, but Supabase Auth's own
 *     Authenticator Assurance Level says a second factor is still needed
 *     (`nextLevel !== currentLevel`, or MFA hasn't been enrolled yet at
 *     all when enrollment itself is mandatory — see the `hasVerifiedFactor`
 *     note below). Password authentication alone NEVER reaches
 *     `authenticated` while this is true (Prompt 0.2's explicit security
 *     rule).
 *   - authenticated: session exists AND `currentLevel === 'aal2'` — MFA
 *     genuinely verified for this session, not merely available.
 *
 * No staff-profile (role/hostel) resolution is implemented yet — see
 * AuthContext.tsx's doc comment and docs/reception-dashboard-architecture.md
 * §16 (superseded by ADR-024 for the authentication *mechanism*; role/
 * permission resolution itself remains a separate, still-open piece of
 * work for a later prompt).
 */
export type AuthStatus =
  "loading" | "config_error" | "unauthenticated" | "mfa_required" | "authenticated";

export function deriveAuthStatus(input: {
  sessionLoading: boolean;
  configError: boolean;
  hasSession: boolean;
  /** Supabase's own `currentLevel`/`nextLevel` AAL pair
   * (mfaService.getAssuranceLevel()) — undefined while that check is still
   * in flight (treated the same as sessionLoading), null if it couldn't be
   * read (treated as MFA still required — fail closed, never fail open). */
  assuranceLevel?: { currentLevel: string | null; nextLevel: string | null } | null;
}): AuthStatus {
  if (input.configError) return "config_error";
  if (input.sessionLoading) return "loading";
  if (!input.hasSession) return "unauthenticated";

  if (input.assuranceLevel === undefined) return "loading";
  if (input.assuranceLevel === null) return "mfa_required";
  if (input.assuranceLevel.currentLevel === "aal2") return "authenticated";
  return "mfa_required";
}
