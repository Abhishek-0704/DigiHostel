import type { FastifyInstance } from "fastify";
import { AuthOtpService } from "../domain/auth/service.js";
import {
  DrizzleEligibilityRepository,
  type EligibilityRepository,
} from "../domain/auth/eligibilityRepository.js";
import {
  InMemoryOtpChallengeStore,
  type OtpChallengeStore,
} from "../domain/auth/otpChallengeStore.js";
import { SupabaseOtpSender, type OtpSender } from "../domain/auth/otpSender.js";

export interface RegisterOtpAuthOverrides {
  /** Injectable for tests — bypasses the real Postgres connection entirely.
   * Production (app.ts, no override) always uses DrizzleEligibilityRepository. */
  eligibilityRepository?: EligibilityRepository;
  /** Injectable for tests — a fresh store per test rather than the real
   * in-memory singleton. Production (app.ts, no override) always uses
   * InMemoryOtpChallengeStore. */
  challengeStore?: OtpChallengeStore;
  /** Injectable for tests — bypasses the real Supabase Auth network path
   * entirely. Production (app.ts, no override) always uses SupabaseOtpSender
   * built from SUPABASE_URL/SUPABASE_ANON_KEY. */
  otpSender?: OtpSender;
}

/**
 * Registers the F-02 remediation's OTP eligibility boundary:
 *   app.authOtpService — the single entry point routes/auth.ts calls.
 *
 * Reads SUPABASE_URL/SUPABASE_ANON_KEY from the environment — fails securely
 * by throwing at startup (not at first request) if either is missing and no
 * otpSender override was supplied, mirroring plugins/auth.ts's exact
 * fail-secure convention. Never reads a service-role key — this boundary only
 * ever needs the same public, anon-keyed GoTrue endpoints the mobile client
 * used to call directly.
 */
// Same loose generic slots as plugins/auth.ts/plugins/leave.ts, same reason
// (Fastify+pino generic-typing friction on a plain function call vs.
// app.register()).
export function registerOtpAuth(
  app: FastifyInstance<any, any, any, any, any>, // eslint-disable-line @typescript-eslint/no-explicit-any -- see plugins/auth.ts
  overrides: RegisterOtpAuthOverrides = {},
): void {
  const eligibilityRepository =
    overrides.eligibilityRepository ?? new DrizzleEligibilityRepository();
  const challengeStore = overrides.challengeStore ?? new InMemoryOtpChallengeStore();
  const otpSender = overrides.otpSender ?? buildDefaultOtpSender();

  app.decorate(
    "authOtpService",
    new AuthOtpService(eligibilityRepository, challengeStore, otpSender),
  );
}

function buildDefaultOtpSender(): OtpSender {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_ANON_KEY are required to register the OTP auth boundary but were not both set",
    );
  }
  return new SupabaseOtpSender(supabaseUrl, supabaseAnonKey);
}

declare module "fastify" {
  interface FastifyInstance {
    authOtpService: AuthOtpService;
  }
}
