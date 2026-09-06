import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "./client";
import { mapAuthError } from "./authErrors";
import { logger } from "../logger/logger";

/**
 * Session-lifecycle abstraction (Prompt 2 foundation). This is the one place
 * in the app that talks to Supabase Auth for identity/session purposes.
 *
 * F-02 remediation (PRR Phase 13): this app no longer calls Supabase's
 * `signInWithOtp`/`verifyOtp` directly with a client-supplied phone number —
 * that was the exact insecure path the remediation closes (any syntactically
 * valid phone number could trigger a real SMS, with no server-side check
 * that it belonged to a registered parent). The OTP flow is now brokered
 * entirely server-side (`src/services/auth/otpEligibility.ts`, backed by
 * `POST /api/v1/auth/otp/request` and `/verify`) — this app never holds or
 * supplies a phone number at any point in login. `adoptSession` is the only
 * remaining piece this service contributes to that flow: once the backend's
 * verify endpoint returns real Supabase session tokens, this locally
 * establishes the app's own session via the SDK, preserving ADR-014's
 * "client manages its own session via the SDK" boundary.
 */
export interface AuthService {
  getSession(): Promise<Session | null>;
  onSessionChange(callback: (session: Session | null, event: AuthChangeEvent) => void): () => void;
  signOut(): Promise<void>;
  /** The current session's access token, or null if there is none. Never
   * logged or exposed to a UI component — see custom-fetch's token-provider
   * wiring (services/api/tokenProvider.ts) for the one sanctioned consumer. */
  getAccessToken(): Promise<string | null>;
  /** Locally establishes a session from tokens the backend's OTP-verify
   * broker already obtained from Supabase server-side. Never called with a
   * client-derived value — always the exact tokens the backend returned. */
  adoptSession(accessToken: string, refreshToken: string): Promise<Session>;
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
    } = getSupabaseClient().auth.onAuthStateChange((event, session) => {
      callback(session, event);
    });
    return () => subscription.unsubscribe();
  },
  async signOut() {
    logger.info("auth: sign-out requested");
    await getSupabaseClient().auth.signOut();
  },
  async getAccessToken() {
    const {
      data: { session },
    } = await getSupabaseClient().auth.getSession();
    return session?.access_token ?? null;
  },
  async adoptSession(accessToken, refreshToken) {
    logger.info("auth: adopting a backend-issued session");
    const { data, error } = await getSupabaseClient().auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error || !data.session) {
      const mapped = mapAuthError(error ?? new Error("setSession resolved without a session"));
      logger.warn("auth: adopting the backend-issued session failed", { kind: mapped.kind });
      throw mapped;
    }
    logger.info("auth: backend-issued session adopted");
    return data.session;
  },
};
