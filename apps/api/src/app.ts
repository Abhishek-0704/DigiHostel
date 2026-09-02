import Fastify from "fastify";
import cors from "@fastify/cors";
import { logger } from "./lib/logger.js";
import { healthRoutes } from "./routes/health.js";
import { testAuthRoutes } from "./routes/test-auth.js";
import { leaveRoutes } from "./routes/leave.js";
import { registerAuth, type RegisterAuthOverrides } from "./plugins/auth.js";
import { registerLeave, type RegisterLeaveOverrides } from "./plugins/leave.js";

export interface BuildAppOptions {
  /** Test-only dependency injection — see plugins/auth.ts. Never used in
   * production (index.ts calls buildApp() with no arguments). */
  authOverrides?: RegisterAuthOverrides;
  /** Test-only dependency injection — see plugins/leave.ts. Never used in
   * production. */
  leaveOverrides?: RegisterLeaveOverrides;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ loggerInstance: logger });

  await app.register(cors);

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
