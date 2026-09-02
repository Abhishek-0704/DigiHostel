import type { FastifyInstance } from "fastify";

// Matches packages/api-spec/openapi.yaml's /healthz operation exactly — the only
// endpoint in scope at this scaffolding stage (Phase 9).
export async function healthRoutes(app: FastifyInstance) {
  app.get(
    "/healthz",
    // Exempt from rate limiting (G-02) — load balancers/orchestrators poll
    // this frequently and it carries no sensitive/expensive operation.
    { config: { rateLimit: false } },
    async () => {
      return { status: "ok" as const };
    },
  );
}
