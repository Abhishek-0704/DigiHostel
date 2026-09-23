import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAal2, requireStaffRole } from "../lib/auth/guards.js";
import { AUDIT_MODULES, AUDIT_ACTOR_TYPES, AUDIT_ENTITY_TYPES } from "../domain/audit/types.js";
import type { AuditListResult, AuditListItemView, AuditStatistics } from "../domain/audit/types.js";

// Same repeated-query-param coercion helper as routes/emergencies.ts/
// routes/health-cases.ts — Fastify's default parser gives a bare string for
// a single occurrence, an array only when the param repeats.
const toArray = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]), z.array(schema));

// .strict() — an unrecognized query field is rejected with 400, matching
// every other staff-facing list endpoint in this codebase.
const listQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    module: toArray(z.enum(AUDIT_MODULES)).optional(),
    actorType: toArray(z.enum(AUDIT_ACTOR_TYPES)).optional(),
    entityType: toArray(z.enum(AUDIT_ENTITY_TYPES)).optional(),
    // Phase 7, Prompt 17 — Administrative Profile's "Personal Activity"
    // panel. Applied after the existing hostel-scope check, never in place
    // of it — a caller can only ever narrow their own already-scoped view,
    // never widen it (passing another staff member's id here simply
    // returns zero rows if that id falls outside the caller's own scope,
    // never an error and never a way to enumerate another user's activity).
    actorId: z.string().uuid().optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(50).optional().default(20),
    sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
  })
  .strict()
  .refine((v) => !v.dateFrom || !v.dateTo || v.dateFrom <= v.dateTo, {
    message: "dateFrom must not be after dateTo.",
  });

function serializeItem(item: AuditListItemView) {
  return {
    id: item.id,
    occurredAt: item.occurredAt,
    action: item.action,
    module: item.module,
    actorType: item.actorType,
    actorId: item.actorId,
    actorName: item.actorName,
    actorRole: item.actorRole,
    entityType: item.entityType,
    entityId: item.entityId,
    studentId: item.studentId,
    studentFullName: item.studentFullName,
    studentRollNumber: item.studentRollNumber,
    hostelId: item.hostelId,
    hostelName: item.hostelName,
    metadata: item.metadata,
  };
}

function serializeList(result: AuditListResult) {
  return {
    items: result.items.map(serializeItem),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  };
}

function serializeStatistics(stats: AuditStatistics) {
  return stats;
}

type StaffProfile = {
  kind: "staff";
  id: string;
  role: "reception_warden" | "hostel_admin" | "super_admin";
};

/**
 * Enterprise Audit Center (Phase 5, Prompt 12) — a privileged, staff-only
 * READ path over `audit_logs`, which has zero client-facing RLS by design
 * (docs/rls-policy-matrix.md). Same role set/AAL2/hostel-scope shape as
 * every other certified staff route (routes/emergencies.ts,
 * routes/health-cases.ts) — reuses the already-declared `audit:view`
 * permission (granted to reception_warden/hostel_admin/super_admin since
 * Prompt 3) to gate the route client-side (UX only); this preHandler chain
 * is the actual server-side boundary. `library_incharge` is never in the
 * allowed-role list — it has no grant on this permission and no product
 * reason to view Reception's audit trail. Strictly read-only: no route in
 * this file ever mutates `audit_logs` or any other table.
 */
export async function auditRoutes(app: FastifyInstance) {
  const staffOnly = [
    app.authenticate,
    requireStaffRole("reception_warden", "hostel_admin", "super_admin"),
    requireAal2(),
  ];

  app.get(
    "/audit",
    { preHandler: staffOnly, config: { rateLimit: app.rateLimitTiers.staffQueue } },
    async (request, reply) => {
      const query = listQuerySchema.safeParse(request.query);
      if (!query.success) {
        await reply.code(400).send({
          error: {
            code: "validation_failed",
            message: query.error.issues[0]?.message ?? "Invalid query parameters.",
          },
        });
        return;
      }
      const profile = request.auth!.profile as StaffProfile;

      const result = await app.auditService.list({
        staffId: profile.id,
        staffRole: profile.role,
        q: query.data.q,
        modules: query.data.module,
        actorTypes: query.data.actorType,
        entityTypes: query.data.entityType,
        actorId: query.data.actorId,
        dateFrom: query.data.dateFrom,
        dateTo: query.data.dateTo,
        page: query.data.page,
        pageSize: query.data.pageSize,
        sortDir: query.data.sortDir,
      });
      await reply.code(200).send(serializeList(result));
    },
  );

  app.get(
    "/audit/statistics",
    { preHandler: staffOnly, config: { rateLimit: app.rateLimitTiers.staffQueue } },
    async (request, reply) => {
      const profile = request.auth!.profile as StaffProfile;
      const stats = await app.auditService.getStatistics({
        staffId: profile.id,
        staffRole: profile.role,
      });
      await reply.code(200).send(serializeStatistics(stats));
    },
  );
}

declare module "fastify" {
  interface FastifyInstance {
    auditService: import("../domain/audit/service.js").AuditService;
  }
}
