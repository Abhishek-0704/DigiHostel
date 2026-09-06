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
      // Build identifier (F-06 production hardening, corrected by F-07E).
      // `RENDER_GIT_COMMIT` is injected automatically by Render into every
      // running container's environment — it is not something this
      // repository configures, and it always reflects the commit actually
      // running (confirmed live: docs/observability.md's build-provenance
      // section). `BUILD_SHA` (a plain, host-agnostic env var) remains the
      // fallback for local dev or any non-Render host, where
      // RENDER_GIT_COMMIT is naturally absent — this is not two competing
      // sources of truth, it is one platform-authoritative source with one
      // portable fallback for environments that aren't Render at all.
      // "unknown" only when neither is set.
      const version = process.env.RENDER_GIT_COMMIT ?? process.env.BUILD_SHA ?? "unknown";
      return { status: "ok" as const, version };
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
