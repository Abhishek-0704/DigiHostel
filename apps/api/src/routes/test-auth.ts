import type { FastifyInstance } from "fastify";
import { requireSuperAdmin } from "../lib/auth/guards.js";

/**
 * Demonstration/test-only routes for the authentication boundary — not
 * business API surface (no OpenAPI spec entry; not part of ADR-007's
 * contract). Exists specifically to satisfy this task's requirement for "at
 * least one protected test route... demonstrating authenticated access,
 * unauthenticated denial, and role-based denial" as a real, runnable
 * mechanism rather than only unit tests of the guard functions in
 * isolation. Prefixed `_internal` to signal it is not part of the product
 * API contract.
 */
export async function testAuthRoutes(app: FastifyInstance) {
  // Authenticated access: any recognized DigiHostel identity. Demonstrates
  // both "authenticated access" (valid token -> 200) and "unauthenticated
  // denial" (missing/invalid token -> 401) via the same route.
  app.get("/_internal/whoami", { preHandler: [app.authenticate] }, async (request) => {
    return {
      userId: request.auth!.userId,
      profileKind: request.auth!.profile.kind,
    };
  });

  // Role-based denial: authenticated but wrong role -> 403.
  app.get(
    "/_internal/staff-only",
    { preHandler: [app.authenticate, requireSuperAdmin()] },
    async () => {
      return { ok: true };
    },
  );
}
