import Fastify from "fastify";
import cors from "@fastify/cors";
import { logger } from "./lib/logger.js";
import { createErrorHandler } from "./lib/errorHandler.js";
import { healthRoutes } from "./routes/health.js";
import { testAuthRoutes } from "./routes/test-auth.js";
import { leaveRoutes } from "./routes/leave.js";
import { authRoutes } from "./routes/auth.js";
import { registerAuth, type RegisterAuthOverrides } from "./plugins/auth.js";
import { registerLeave, type RegisterLeaveOverrides } from "./plugins/leave.js";
import { registerRateLimit, type RegisterRateLimitOverrides } from "./plugins/rateLimit.js";
import { registerOtpAuth, type RegisterOtpAuthOverrides } from "./plugins/otpAuth.js";

export interface BuildAppOptions {
  /** Test-only dependency injection — see plugins/auth.ts. Never used in
   * production (index.ts calls buildApp() with no arguments). */
  authOverrides?: RegisterAuthOverrides;
  /** Test-only dependency injection — see plugins/leave.ts. Never used in
   * production. */
  leaveOverrides?: RegisterLeaveOverrides;
  /** Test-only dependency injection — see plugins/rateLimit.ts. Never used
   * in production. */
  rateLimitOverrides?: RegisterRateLimitOverrides;
  /** Test-only dependency injection — see plugins/otpAuth.ts. Never used in
   * production. */
  otpAuthOverrides?: RegisterOtpAuthOverrides;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ loggerInstance: logger });

  // F-07 (production observability): Fastify already assigns every request
  // a request ID (its own internal sequential generator — `requestIdHeader`
  // is never set anywhere in this codebase, so Fastify's documented default
  // of `false` applies and no client-supplied header is ever trusted or
  // parsed for this; verified against the installed Fastify version's own
  // config defaults, not assumed) and threads it through every
  // `request.log` call automatically. What was missing is the other half:
  // the ID never reached the client at all, so a user reporting "I got an
  // error" had nothing to hand support that could be correlated back to a
  // specific server-side log line. This header is the minimum safe
  // mechanism — it exposes only an opaque per-request counter, nothing
  // sensitive, and requires no new dependency.
  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-request-id", request.id);
    return payload;
  });

  // Global error handler (G-01) — must be set before any route can run, so
  // every unexpected exception (from any route) is sanitized the same way.
  app.setErrorHandler(createErrorHandler());

  // No browser-based client exists for this API today (the mobile apps call
  // it directly, not from a web origin, and auth is bearer-token rather than
  // cookie-based). `@fastify/cors` defaults to `origin: "*"` when given no
  // options — an unnecessary "secure by default" gap (docs/security.md) with
  // no current capability benefit. Disabled explicitly rather than left to
  // the plugin's own default.
  await app.register(cors, { origin: false });
  // Global rate limiting (G-02) — registered before routes so its `onRequest`
  // hook covers every route by default; individual sensitive routes
  // (routes/leave.ts) tighten this via their own `config.rateLimit`, and
  // /healthz opts out entirely (routes/health.ts).
  await registerRateLimit(app, options.rateLimitOverrides);

  // Decorates app.authenticate / app.authDbPort / app.leaveService before
  // any routes that use them are registered — Fastify decorators flow down
  // to child contexts, not up, so this must run first. /healthz below is
  // unaffected: it never lists app.authenticate in its own preHandler
  // chain, so it stays public.
  registerAuth(app, options.authOverrides);
  registerLeave(app, options.leaveOverrides);
  registerOtpAuth(app, options.otpAuthOverrides);

  await app.register(healthRoutes, { prefix: "/api/v1" });
  // Demonstration/test-only routes (test-auth.ts's own doc comment) — never
  // part of the product API contract. Previously registered unconditionally,
  // which meant a production deployment shipped an ungated
  // authenticated-token-validity oracle for no product purpose (RC1
  // hardening finding). Gated the same way `logger.ts` already gates its own
  // dev-only transport, rather than inventing a new flag.
  if (process.env.NODE_ENV !== "production") {
    await app.register(testAuthRoutes, { prefix: "/api/v1" });
  }
  await app.register(leaveRoutes, { prefix: "/api/v1" });
  // F-02 remediation (PRR Phase 13) — the ADR-020-required eligibility gate.
  // Deliberately not gated by NODE_ENV: unlike test-auth.ts, this is real
  // product login functionality, not a demonstration route.
  await app.register(authRoutes, { prefix: "/api/v1" });

  return app;
}
