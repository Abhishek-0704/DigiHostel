import type { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import {
  RATE_LIMIT_GLOBAL,
  RATE_LIMIT_DECISION,
  RATE_LIMIT_CREATE,
  RATE_LIMIT_EXPIRE,
  RATE_LIMIT_OTP_REQUEST,
  RATE_LIMIT_OTP_VERIFY,
  RATE_LIMIT_DEVICE_CHALLENGE,
  RATE_LIMIT_DEVICE_REGISTER,
  RATE_LIMIT_STAFF_AUTH_AUDIT,
  RATE_LIMIT_STAFF_QUEUE,
  RATE_LIMIT_START_PARENT_APPROVAL,
  RATE_LIMIT_EXIT_AUTHORIZATION,
  RATE_LIMIT_STAFF_ADMIN,
  RATE_LIMIT_CONFIGURATION_ADMIN,
  RATE_LIMIT_PROFILE,
  type RateLimitTier,
} from "../config/rateLimit.js";

export interface RateLimitTiers {
  global: RateLimitTier;
  decision: RateLimitTier;
  create: RateLimitTier;
  expire: RateLimitTier;
  otpRequest: RateLimitTier;
  otpVerify: RateLimitTier;
  deviceChallenge: RateLimitTier;
  deviceRegister: RateLimitTier;
  staffAuthAudit: RateLimitTier;
  staffQueue: RateLimitTier;
  startParentApproval: RateLimitTier;
  exitAuthorization: RateLimitTier;
  staffAdmin: RateLimitTier;
  configurationAdmin: RateLimitTier;
  profile: RateLimitTier;
}

export interface RegisterRateLimitOverrides {
  /** Injectable for tests — lets a test exercise "exceeding the limit"
   * with a small, fast threshold instead of the production defaults.
   * Production (app.ts, no override) always uses config/rateLimit.ts's
   * env-driven values. */
  tiers?: Partial<RateLimitTiers>;
}

/**
 * Registers @fastify/rate-limit globally and decorates `app.rateLimitTiers`
 * with the per-sensitivity-tier limits routes/leave.ts applies to its own
 * sensitive endpoints via each route's own `config.rateLimit` option
 * (Prompt 0.6 audit G-02).
 *
 * Keying strategy: source IP address — @fastify/rate-limit's default
 * `keyGenerator`, deliberately not overridden to key by authenticated
 * identity. The rate-limit hook runs at Fastify's `onRequest` stage, before
 * `app.authenticate` (a preHandler) has resolved who the caller is; keying
 * by identity here would require reordering the auth/rate-limit hook
 * lifecycle, which risks weakening the auth-first request pipeline for a
 * change scoped to rate limiting only. IP-based keying is well-supported,
 * requires no such reordering, and protects both authenticated and
 * unauthenticated request floods equally — an attacker holding one stolen or
 * otherwise-valid bearer token is still capped per-IP. This also means the
 * limiter behaves identically for authenticated and unauthenticated
 * requests: both are throttled by source IP, before either is inspected.
 *
 * No route in this API is keyed by a resource id (e.g. leaveRequestId) —
 * deliberately, so a 429 response's timing/threshold can never be used as a
 * signal about whether a given resource exists (would reopen the
 * anti-enumeration problem the leave routes otherwise close).
 */
// Same loose generic slots as plugins/auth.ts/plugins/leave.ts, same reason
// (Fastify+pino generic-typing friction on a plain function call vs.
// app.register() — here specifically surfaced through @fastify/rate-limit's
// own route-typing augmentation).
export async function registerRateLimit(
  app: FastifyInstance<any, any, any, any, any>, // eslint-disable-line @typescript-eslint/no-explicit-any -- see plugins/auth.ts
  overrides: RegisterRateLimitOverrides = {},
): Promise<void> {
  const tiers: RateLimitTiers = {
    global: overrides.tiers?.global ?? RATE_LIMIT_GLOBAL,
    decision: overrides.tiers?.decision ?? RATE_LIMIT_DECISION,
    create: overrides.tiers?.create ?? RATE_LIMIT_CREATE,
    expire: overrides.tiers?.expire ?? RATE_LIMIT_EXPIRE,
    otpRequest: overrides.tiers?.otpRequest ?? RATE_LIMIT_OTP_REQUEST,
    otpVerify: overrides.tiers?.otpVerify ?? RATE_LIMIT_OTP_VERIFY,
    deviceChallenge: overrides.tiers?.deviceChallenge ?? RATE_LIMIT_DEVICE_CHALLENGE,
    deviceRegister: overrides.tiers?.deviceRegister ?? RATE_LIMIT_DEVICE_REGISTER,
    staffAuthAudit: overrides.tiers?.staffAuthAudit ?? RATE_LIMIT_STAFF_AUTH_AUDIT,
    staffQueue: overrides.tiers?.staffQueue ?? RATE_LIMIT_STAFF_QUEUE,
    startParentApproval: overrides.tiers?.startParentApproval ?? RATE_LIMIT_START_PARENT_APPROVAL,
    exitAuthorization: overrides.tiers?.exitAuthorization ?? RATE_LIMIT_EXIT_AUTHORIZATION,
    staffAdmin: overrides.tiers?.staffAdmin ?? RATE_LIMIT_STAFF_ADMIN,
    configurationAdmin: overrides.tiers?.configurationAdmin ?? RATE_LIMIT_CONFIGURATION_ADMIN,
    profile: overrides.tiers?.profile ?? RATE_LIMIT_PROFILE,
  };

  await app.register(rateLimit, {
    global: true,
    max: tiers.global.max,
    timeWindow: tiers.global.timeWindow,
    // @fastify/rate-limit `throw`s whatever this returns (index.js:375),
    // relying on the app's own error handler to read `.statusCode`/`.code`/
    // `.message` off it — the same flat shape a FastifyError carries. Our
    // global error handler (lib/errorHandler.ts) already knows how to turn
    // exactly that shape into this API's standard {error:{code,message}}
    // response body, so no special-casing is needed there: returning it
    // flat here, rather than pre-nested, is what makes a 429 come out
    // consistent with every other error response in this API.
    errorResponseBuilder: (_req, context) => ({
      statusCode: context.statusCode,
      code: "rate_limited",
      message: `Too many requests. Try again in ${context.after}.`,
    }),
  });

  app.decorate("rateLimitTiers", tiers);
}

declare module "fastify" {
  interface FastifyInstance {
    rateLimitTiers: RateLimitTiers;
  }
}
