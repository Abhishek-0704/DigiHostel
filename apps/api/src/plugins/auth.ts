import type { FastifyInstance } from "fastify";
import { createJwtVerifier, AuthConfigError, type JwtVerifier } from "../lib/auth/jwt.js";
import { DrizzleAuthDbPort } from "../lib/auth/db-port.js";
import { createAuthenticate } from "../lib/auth/guards.js";
import type { AuthDbPort } from "../lib/auth/db-port.js";

export interface RegisterAuthOverrides {
  /** Injectable for tests — bypasses the real JWKS/network path entirely
   * (see lib/auth/jwt.test.ts and routes/test-auth.test.ts). Production
   * (app.ts, no override) always uses createJwtVerifier against SUPABASE_URL. */
  jwtVerifier?: JwtVerifier;
  /** Injectable for tests — bypasses the real Postgres connection entirely.
   * Production (app.ts, no override) always uses DrizzleAuthDbPort. */
  authDbPort?: AuthDbPort;
}

/**
 * Registers the authentication boundary on the app instance:
 *   app.authenticate   — the base preHandler every protected route composes first
 *   app.authDbPort     — the DB port, for routes that need additional relationship/
 *                        scope checks beyond the guard factories in lib/auth/guards.ts
 *
 * Reads SUPABASE_URL from the environment (env.example) — fails securely by
 * throwing at startup (not at first request) if it's missing and no
 * jwtVerifier override was supplied, per this task's requirement. Does not
 * touch /healthz or any other existing route; routes opt in explicitly by
 * listing `app.authenticate` (plus whichever guards they need) in their own
 * preHandler chain.
 */
// The generic slots are intentionally loose here (not the bare
// `FastifyInstance` shorthand): `Fastify({ loggerInstance })` in app.ts
// instantiates a concrete pino Logger generic that doesn't structurally
// unify with `FastifyInstance`'s default `FastifyBaseLogger` type param when
// passed to a plain function call (as opposed to `app.register(...)`, which
// has its own, more permissive typing for exactly this case) — a known
// category of Fastify+TypeScript friction, not a real type-safety gap.
export function registerAuth(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- justified escape hatch, see comment above
  app: FastifyInstance<any, any, any, any, any>,
  overrides: RegisterAuthOverrides = {},
): void {
  const jwtVerifier = overrides.jwtVerifier ?? buildDefaultJwtVerifier();
  const authDbPort = overrides.authDbPort ?? new DrizzleAuthDbPort();

  app.decorate("authenticate", createAuthenticate(jwtVerifier, authDbPort));
  app.decorate("authDbPort", authDbPort);
}

function buildDefaultJwtVerifier(): JwtVerifier {
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    throw new AuthConfigError(
      "SUPABASE_URL is required to register the authentication boundary but was not set",
    );
  }
  return createJwtVerifier({ supabaseUrl });
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: ReturnType<typeof createAuthenticate>;
    authDbPort: AuthDbPort;
  }
}
