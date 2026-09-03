import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "./client";

/**
 * Session-lifecycle abstraction (Prompt 2 foundation) — deliberately
 * minimal. This wraps only the generic parts of Supabase Auth every screen
 * needs regardless of how a session was established: reading the current
 * session, subscribing to session changes, and signing out.
 *
 * Explicitly NOT included here, per this prompt's scope (a future prompt's
 * responsibility): signInWithOtp, verifyOtp, or any roll-number/registration
 * logic. ADR-020 has decided the mechanism (Supabase's native phone-OTP
 * flow) but no login/registration code is written in this foundation pass.
 */
export interface AuthService {
  getSession(): Promise<Session | null>;
  onSessionChange(callback: (session: Session | null) => void): () => void;
  signOut(): Promise<void>;
}

export const authService: AuthService = {
  async getSession() {
    const {
      data: { session },
    } = await getSupabaseClient().auth.getSession();
    return session;
  },
  onSessionChange(callback) {
    const {
      data: { subscription },
    } = getSupabaseClient().auth.onAuthStateChange((_event, session) => {
      callback(session);
    });
    return () => subscription.unsubscribe();
  },
  async signOut() {
    await getSupabaseClient().auth.signOut();
  },
};
