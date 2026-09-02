import Fastify from "fastify";
import cors from "@fastify/cors";
import { logger } from "./lib/logger.js";
import { createErrorHandler } from "./lib/errorHandler.js";
import { healthRoutes } from "./routes/health.js";
import { testAuthRoutes } from "./routes/test-auth.js";
import { leaveRoutes } from "./routes/leave.js";
import { registerAuth, type RegisterAuthOverrides } from "./plugins/auth.js";
import { registerLeave, type RegisterLeaveOverrides } from "./plugins/leave.js";
import { registerRateLimit, type RegisterRateLimitOverrides } from "./plugins/rateLimit.js";

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
}

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ loggerInstance: logger });

  // Global error handler (G-01) — must be set before any route can run, so
  // every unexpected exception (from any route) is sanitized the same way.
  app.setErrorHandler(createErrorHandler());

  await app.register(cors);
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

  await app.register(healthRoutes, { prefix: "/api/v1" });
  await app.register(testAuthRoutes, { prefix: "/api/v1" });
  await app.register(leaveRoutes, { prefix: "/api/v1" });

  return app;
}
