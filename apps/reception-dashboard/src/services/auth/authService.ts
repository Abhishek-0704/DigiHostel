import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseClient } from "../../lib/supabase/client";
import { mapAuthError } from "./authErrors";

/**
 * Session-lifecycle + password-authentication abstraction (Prompt 0.2
 * foundation, completed Prompt 1 — Authentication Infrastructure, per
 * ADR-024's accepted mechanism). `getSession`, `onSessionChange`,
 * `getAccessToken`, `getUser`, and `signOut` are mechanism-agnostic Supabase
 * Auth session operations; `signIn` is the one real password-authentication
 * call, added now that ADR-024 has accepted the mechanism (it was
 * deliberately absent through Prompt 0.2/0.3/3 — see those prompts' own doc
 * comments, preserved in git history, not repeated here).
 *
 * `signIn` returns only a sanitized `AppError` on failure (never the raw
 * Supabase error) — see authErrors.ts's `mapAuthError`, and never logs the
 * password or any token (grep this file: no `password`/`token` value is
 * ever passed to `logger`). Supabase's own SDK owns all token storage and
 * refresh — this file never persists a token itself (lib/supabase/client.ts's
 * `persistSession`/`autoRefreshToken`, unchanged).
 *
 * `signIn` deliberately does NOT record an audit event itself — see
 * AuthContext.tsx's doc comment for why that's a reactive, state-transition
 * concern rather than an imperative one, keeping this service a thin,
 * side-effect-free (beyond the Supabase call itself) wrapper.
 */
export const authService = {
  /** Step one of ADR-024's chain (Email+Password → Supabase Auth →
   * authenticated session). Returns the resulting session on success — its
   * `aal`/`amr` will be `"aal1"` at this point; MFA (mfaService.challenge/
   * verify) is a separate, subsequent step, not performed here. */
  async signIn(email: string, password: string): Promise<Session> {
    const { data, error } = await getSupabaseClient().auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw mapAuthError(error);
    if (!data.session) {
      // Should not happen for a password grant (unlike OTP/magic-link flows,
      // which can return a user with no session pending further action) —
      // fail closed rather than returning something callers would treat as
      // signed in.
      throw mapAuthError(new Error("Sign-in succeeded but no session was returned."));
    }
    return data.session;
  },

  async getSession(): Promise<Session | null> {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error) throw mapAuthError(error);
    return data.session;
  },

  async getUser(): Promise<User | null> {
    const { data, error } = await getSupabaseClient().auth.getUser();
    if (error) throw mapAuthError(error);
    return data.user;
  },

  onSessionChange(callback: (session: Session | null) => void): () => void {
    const {
      data: { subscription },
    } = getSupabaseClient().auth.onAuthStateChange((_event, session) => {
      callback(session);
    });
    return () => subscription.unsubscribe();
  },

  async getAccessToken(): Promise<string | null> {
    const { data } = await getSupabaseClient().auth.getSession();
    return data.session?.access_token ?? null;
  },

  /** Idempotent: Supabase's own `signOut()` is safe to call on an
   * already-signed-out client (resolves without error — verified against
   * the installed SDK's own behavior, not assumed) — calling this twice in
   * a row does not throw or corrupt state. */
  async signOut(): Promise<void> {
    const { error } = await getSupabaseClient().auth.signOut();
    if (error) throw mapAuthError(error);
  },

  /** Phase 7, Prompt 17 — Administrative Profile's Session Management
   * panel. GoTrue's own native `scope: "others"` sign-out: revokes every
   * OTHER session belonging to the SAME authenticated user, using nothing
   * but the current session's own access token. There is no user/session
   * identifier parameter anywhere in this call or in GoTrue's own API for
   * it — "which sessions" is entirely derived server-side from the
   * presented token, so this can never be used to target another user's
   * session, by construction, not by an application-level check. Leaves
   * the CURRENT session intact (unlike `signOut()` above). */
  async signOutOtherSessions(): Promise<void> {
    const { error } = await getSupabaseClient().auth.signOut({ scope: "others" });
    if (error) throw mapAuthError(error);
  },
};
