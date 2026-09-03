import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "./client";
import { mapAuthError } from "./authErrors";
import { isValidPhoneNumber, maskPhoneNumber } from "../../utils/phone";
import { AppError, safeMessageFor } from "../../types/errors";
import { logger } from "../logger/logger";

/**
 * Session-lifecycle + phone-OTP abstraction (Prompt 2 foundation, extended
 * in Prompt 3). Wraps Supabase Auth's native phone-OTP flow (ADR-020,
 * ACCEPTED) — Fastify never generates, stores, or verifies OTP codes
 * itself; this is the one place in the app that talks to Supabase Auth for
 * identity/session purposes.
 *
 * Explicitly NOT included here: any roll-number-to-parent-record pre-check.
 * ADR-020 requires that check to run before an OTP is triggered (so SMS is
 * only ever sent to an already-registered parent's number), but no backend
 * endpoint for it exists yet (verified this session — apps/api/src/routes
 * has no such route). Calling `sendOtp` as implemented here WILL trigger a
 * real Supabase SMS to whatever number is supplied, with no server-side
 * check that it belongs to a registered parent — see this app's foundation
 * report for the explicit risk this creates (SMS-cost/abuse exposure, not
 * an application-authorization bypass — an unregistered number still can't
 * reach any protected data, since the backend's `resolveAppProfile` returns
 * `none` -> 401 `no_app_profile` for any Supabase identity with no matching
 * `parents` row, per apps/api/src/lib/auth/profile.ts). Do not silently
 * "fix" this by inventing a pre-check here; it belongs on the backend.
 */
export interface AuthService {
  getSession(): Promise<Session | null>;
  onSessionChange(callback: (session: Session | null, event: AuthChangeEvent) => void): () => void;
  signOut(): Promise<void>;
  /** The current session's access token, or null if there is none. Never
   * logged or exposed to a UI component — see custom-fetch's token-provider
   * wiring (services/api/tokenProvider.ts) for the one sanctioned consumer. */
  getAccessToken(): Promise<string | null>;
  sendOtp(phoneNumber: string): Promise<void>;
  verifyOtp(phoneNumber: string, token: string): Promise<Session>;
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
  async sendOtp(phoneNumber) {
    if (!isValidPhoneNumber(phoneNumber)) {
      throw new AppError("invalid_phone_number", safeMessageFor("invalid_phone_number"));
    }
    logger.info("auth: otp send initiated", { phone: maskPhoneNumber(phoneNumber) });
    const { error } = await getSupabaseClient().auth.signInWithOtp({ phone: phoneNumber });
    if (error) {
      const mapped = mapAuthError(error, "send_otp");
      logger.warn("auth: otp send failed", {
        phone: maskPhoneNumber(phoneNumber),
        kind: mapped.kind,
      });
      throw mapped;
    }
    logger.info("auth: otp send succeeded", { phone: maskPhoneNumber(phoneNumber) });
  },
  async verifyOtp(phoneNumber, token) {
    logger.info("auth: otp verification attempted", { phone: maskPhoneNumber(phoneNumber) });
    const { data, error } = await getSupabaseClient().auth.verifyOtp({
      phone: phoneNumber,
      token,
      type: "sms",
    });
    if (error || !data.session) {
      const mapped = mapAuthError(
        error ?? new Error("verifyOtp resolved without a session"),
        "verify_otp",
      );
      logger.warn("auth: otp verification failed", {
        phone: maskPhoneNumber(phoneNumber),
        kind: mapped.kind,
      });
      throw mapped;
    }
    logger.info("auth: otp verification succeeded", { phone: maskPhoneNumber(phoneNumber) });
    return data.session;
  },
};
