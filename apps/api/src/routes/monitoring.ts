import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, auditLogs } from "@digihostel/db";
import { logger } from "../lib/logger.js";
import { requireAal2, requireSuperAdmin } from "../lib/auth/guards.js";

type MonitoringProfile = { kind: "staff"; id: string; role: "super_admin" };

const diagnosticParamsSchema = z.object({ diagnosticId: z.string().min(1).max(100) }).strict();

/** Fire-and-forget, matching `domain/auth/staffAuthAudit.ts`'s established
 * "an audit write failure must never block or fail a decision that has
 * already been made" convention — a diagnostic result is already computed
 * and about to be returned to the caller regardless of whether this write
 * succeeds. Reuses the existing `audit_logs` table directly (no new audit
 * mechanism, Prompt 18 §26). */
async function recordDiagnosticRun(staffId: string, diagnosticId: string, status: string) {
  try {
    await db.insert(auditLogs).values({
      actorType: "staff",
      actorId: staffId,
      action: "monitoring.diagnostic_run",
      entityType: "staff",
      entityId: staffId,
      metadata: { diagnosticId, status },
    });
  } catch (err) {
    logger.warn({ err, diagnosticId }, "monitoring: diagnostic audit write failed");
  }
}

/**
 * Enterprise Operations Monitoring Center (Phase 7, Prompt 18). Reuses the
 * existing `system:view` permission boundary — granted only to
 * `super_admin` since Prompt 3 — and the existing AAL2 staff boundary
 * (matches every other high-privilege administrative route family:
 * `staffRoutes`, `configurationRoutes`). No new role, permission, or
 * authentication mechanism.
 *
 * Every route is read-only except the diagnostic-run action, which itself
 * mutates nothing application-facing (§17 — "diagnostics are NOT
 * administrative repair operations") beyond writing one audit row.
 */
export async function monitoringRoutes(app: FastifyInstance) {
  const monitoringOnly = [app.authenticate, requireSuperAdmin(), requireAal2()];

  app.get(
    "/monitoring/overview",
    { preHandler: monitoringOnly, config: { rateLimit: app.rateLimitTiers.staffQueue } },
    async (request, reply) => {
      const profile = request.auth!.profile as MonitoringProfile;
      const overview = await app.monitoringService.getOverview({ staffId: profile.id });
      await reply.code(200).send(overview);
    },
  );

  app.get(
    "/monitoring/diagnostics",
    { preHandler: monitoringOnly, config: { rateLimit: app.rateLimitTiers.staffQueue } },
    async (_request, reply) => {
      await reply.code(200).send({ diagnostics: app.monitoringService.listDiagnostics() });
    },
  );

  app.post(
    "/monitoring/diagnostics/:diagnosticId/run",
    // Reuses RATE_LIMIT_STAFF_ADMIN's own tier — a diagnostic can invoke the
    // Supabase Auth Admin API, the same class of "costly/sensitive
    // external-API-backed action" that tier already exists to protect
    // (config/rateLimit.ts's own doc comment).
    { preHandler: monitoringOnly, config: { rateLimit: app.rateLimitTiers.staffAdmin } },
    async (request, reply) => {
      const params = diagnosticParamsSchema.safeParse(request.params);
      if (!params.success) {
        await reply
          .code(400)
          .send({ error: { code: "validation_failed", message: "Invalid diagnostic id." } });
        return;
      }
      const profile = request.auth!.profile as MonitoringProfile;
      const result = await app.monitoringService.runDiagnostic(params.data.diagnosticId);
      if (!result) {
        await reply.code(404).send({
          error: { code: "diagnostic_not_found", message: "Unrecognized diagnostic id." },
        });
        return;
      }
      await recordDiagnosticRun(profile.id, result.id, result.status);
      await reply.code(200).send(result);
    },
  );
}
