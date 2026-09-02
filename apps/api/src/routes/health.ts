import type { FastifyInstance } from "fastify";

// Matches packages/api-spec/openapi.yaml's /healthz operation exactly — the only
// endpoint in scope at this scaffolding stage (Phase 9).
export async function healthRoutes(app: FastifyInstance) {
  app.get("/healthz", async () => {
    return { status: "ok" as const };
  });
}
