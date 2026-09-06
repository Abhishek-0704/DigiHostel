import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { OtpVerificationResult } from "./types.js";

/**
 * F-02 remediation — the backend-side half of Supabase's native phone-OTP
 * flow (ADR-020, unchanged). Moves *who calls* `signInWithOtp`/`verifyOtp`
 * from the mobile client (the insecure pre-F-02 design) to this Fastify
 * service, which only ever calls them after `AuthOtpService` has confirmed
 * eligibility — the mechanism itself is not replaced, no new auth provider
 * is introduced, and ADR-014's boundary (Supabase Auth remains the sole
 * identity/session issuer) is unchanged: this class never mints, stores, or
 * manages a session itself, it only relays the one Supabase already issued
 * back through this one HTTP round-trip.
 *
 * Uses the anon key, not the service-role key — `signInWithOtp`/`verifyOtp`
 * are public GoTrue endpoints that require no elevated privilege (they are
 * exactly what the client used to call directly with its own anon key);
 * moving the call site to the backend does not require a more privileged
 * credential, and per this task's explicit requirement, no service-role key
 * is introduced here or anywhere reachable from the mobile app.
 */
export interface OtpSender {
  /** Fire-and-forget from this port's own perspective — ADR-018/ADR-010's
   * "at-least-once, duplicate-tolerant" reasoning applies here too: a retry
   * of an already-sent OTP causes a duplicate SMS, never a duplicate
   * account/session, since verification is a separate, idempotent step. */
  send(phoneNumber: string): Promise<void>;
  /** Returns the resulting session's tokens on success, or `null` on any
   * failure (wrong code, expired code, provider error) — the caller
   * (routes/auth.ts) maps `null` to one generic, enumeration-safe error
   * response; the specific Supabase-side reason is logged server-side only,
   * never relayed to the client. */
  verify(phoneNumber: string, code: string): Promise<OtpVerificationResult | null>;
}

export class SupabaseOtpSender implements OtpSender {
  private readonly client: SupabaseClient;

  constructor(supabaseUrl: string, supabaseAnonKey: string) {
    // auth.persistSession/autoRefreshToken are meaningless for a short-lived,
    // per-request server-side client that never keeps a session of its own —
    // disabled explicitly rather than left to the SDK's browser-oriented
    // defaults.
    this.client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async send(phoneNumber: string): Promise<void> {
    // shouldCreateUser: false (this task's own explicit secondary defense,
    // §9) — eligibility (an existing parents row, linked via an existing
    // relationship) is the primary control; this additionally ensures a
    // request that somehow reached this point for a phone with no existing
    // Supabase Auth identity cannot silently provision a brand-new one.
    const { error } = await this.client.auth.signInWithOtp({
      phone: phoneNumber,
      options: { shouldCreateUser: false },
    });
    if (error) {
      throw error;
    }
  }

  async verify(phoneNumber: string, code: string): Promise<OtpVerificationResult | null> {
    const { data, error } = await this.client.auth.verifyOtp({
      phone: phoneNumber,
      token: code,
      type: "sms",
    });
    if (error || !data.session) {
      return null;
    }
    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    };
  }
}
