import type {
  AuthMFAGetAuthenticatorAssuranceLevelResponse,
  Factor,
  MFAEnrollTOTPParams,
  MFAChallengeParams,
  MFAVerifyParams,
  MFAUnenrollParams,
} from "@supabase/supabase-js";
import { getSupabaseClient } from "../../lib/supabase/client";

/**
 * MFA foundation (Prompt 0.2 §13/§18 — ACCEPTED requirement: Password + MFA
 * for staff authentication, per this task's explicit instruction; see
 * docs/adr/ADR-024). Thin, real wrappers around Supabase Auth's own native
 * MFA API (`supabase.auth.mfa.*`, verified present in the installed
 * `@supabase/auth-js@2.113.0` — `GoTrueMFAApi`) — NOT a custom MFA protocol.
 * No TOTP secret is ever stored by this application; Supabase Auth owns
 * factor secrets entirely (its own `auth.mfa_factors` table, outside this
 * repository's schema/RLS).
 *
 * TOTP (authenticator-app) is the only factor type wrapped here — Supabase
 * also supports phone and WebAuthn factors, but TOTP needs no SMS provider
 * or additional vendor dependency (the same "avoid an unjustified vendor
 * dependency" reasoning ADR-020 already applied to OTP delivery). Revisit
 * if a concrete requirement for a second factor type emerges — not
 * speculated here.
 *
 * No enrollment/challenge/verification UI exists anywhere yet (Prompt 0.2
 * §4 explicitly forbids it) — this is the abstraction Prompt 1/2 will call
 * from real screens, exactly the same relationship `authService` already
 * has to the (not-yet-built) login screen.
 */
export const mfaService = {
  /** Reads the current session's Authenticator Assurance Level directly
   * from Supabase Auth — `currentLevel`/`nextLevel` of `'aal1'`/`'aal2'` is
   * the SDK-documented way to detect "signed in with password only, MFA
   * still required" (`nextLevel !== currentLevel`) vs. "fully verified"
   * (`currentLevel === 'aal2'`). Used by contexts/authStatus.ts — never
   * re-derived ad hoc elsewhere. */
  async getAssuranceLevel(): Promise<AuthMFAGetAuthenticatorAssuranceLevelResponse["data"] | null> {
    const { data, error } = await getSupabaseClient().auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) throw error;
    return data;
  },

  async listFactors(): Promise<Factor[]> {
    const { data, error } = await getSupabaseClient().auth.mfa.listFactors();
    if (error) throw error;
    return data.all;
  },

  async enrollTotp(params: Omit<MFAEnrollTOTPParams, "factorType">) {
    const { data, error } = await getSupabaseClient().auth.mfa.enroll({
      factorType: "totp",
      ...params,
    });
    if (error) throw error;
    return data;
  },

  async challenge(params: MFAChallengeParams) {
    const { data, error } = await getSupabaseClient().auth.mfa.challenge(params);
    if (error) throw error;
    return data;
  },

  async verify(params: MFAVerifyParams) {
    const { data, error } = await getSupabaseClient().auth.mfa.verify(params);
    if (error) throw error;
    return data;
  },

  async unenroll(params: MFAUnenrollParams): Promise<void> {
    const { error } = await getSupabaseClient().auth.mfa.unenroll(params);
    if (error) throw error;
  },
};

/**
 * Pure helper (Prompt 1 §11/§17 — "expired/invalid challenge" is one of the
 * states authentication infrastructure must correctly handle). A
 * `challenge()` response's `expires_at` is a Unix seconds timestamp
 * (matching Supabase Auth's own JWT `exp`/`iat` convention, confirmed by
 * this repository's own empirical JWT decode — Prompt 3's local-Supabase
 * verification). Lets a future screen (Prompt 2) proactively detect an
 * expired challenge and re-challenge instead of submitting a code that Supabase
 * would reject anyway, without needing to parse a Supabase error message to
 * find out.
 */
export function isChallengeExpired(expiresAtSeconds: number): boolean {
  return Date.now() >= expiresAtSeconds * 1000;
}
