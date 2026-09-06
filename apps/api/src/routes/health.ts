import type { FastifyInstance } from "fastify";
import { sql, db } from "@digihostel/db";

// Matches packages/api-spec/openapi.yaml's /healthz and /readyz operations
// exactly.
export async function healthRoutes(app: FastifyInstance) {
  app.get(
    "/healthz",
    // Exempt from rate limiting (G-02) — load balancers/orchestrators poll
    // this frequently and it carries no sensitive/expensive operation.
    // Liveness only: "is this process alive at all" — never touches the
    // database, so it stays fast and correct even if Postgres is briefly
    // unreachable (that's what /readyz is for). This is the endpoint a
    // host's own container-restart health check should target.
    { config: { rateLimit: false } },
    async () => {
      // Build identifier (F-06 production hardening) — whatever the
      // deployment host injects (e.g. a git SHA), so a running instance's
      // exact build is verifiable after a deploy without exposing anything
      // sensitive. "unknown" locally/in any environment that sets nothing.
      return { status: "ok" as const, version: process.env.BUILD_SHA ?? "unknown" };
    },
  );

  app.get(
    "/readyz",
    // Also rate-limit exempt, same reasoning as /healthz.
    { config: { rateLimit: false } },
    async (request, reply) => {
      // Readiness: "can this instance actually serve production traffic" —
      // checks the one dependency every route and every pg-boss worker
      // shares (Postgres). A trivial query, not a business query — cheap by
      // design (F-06). Never returns the underlying error's message/stack;
      // a DB-connectivity failure is real internal detail this endpoint
      // must not leak (F-06 security verification).
      try {
        await db.execute(sql`select 1`);
        return { status: "ok" as const };
      } catch (err) {
        // F-07: previously silent — a 503 with no server-side log line gave
        // an operator no way to distinguish "DB unreachable" from "DB slow"
        // from any other cause without separately checking Postgres itself.
        // Logged server-side only, never in the response.
        request.log.warn({ err }, "readyz: dependency check failed");
        await reply.code(503).send({ status: "not_ready" as const });
      }
    },
  );
}
