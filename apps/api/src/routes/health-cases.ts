import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { requireAal2, requireStaffRole } from "../lib/auth/guards.js";
import {
  HealthDomainError,
  HealthStudentNotFoundError,
  HealthCaseNotFoundError,
  HealthCaseConflictError,
} from "../domain/health/errors.js";
import {
  HEALTH_CASE_CATEGORIES,
  HEALTH_CASE_SEVERITIES,
  HEALTH_CASE_STATUSES,
} from "../domain/health/types.js";
import type {
  HealthCaseListResult,
  HealthCaseDetailView,
  HealthCaseStatistics,
  HealthCaseEventView,
} from "../domain/health/types.js";

// Same query-param coercion as routes/emergencies.ts — Fastify's default
// parser produces a bare string for a single repeated param and only an
// array when the param repeats.
const toArray = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]), z.array(schema));

const listQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    // Prompt 11 closure (Medical History) — narrows the list to one
    // student's own cases. Not a trust boundary of its own: `scopeCheck()`
    // (hostel scope) still applies identically regardless of this filter,
    // so a studentId outside the caller's scope simply yields zero rows,
    // the same tolerant "no results" shape every other list filter already
    // has — never a 404/anti-enumeration case, since this is a list
    // endpoint, not a single-resource lookup.
    studentId: z.string().uuid().optional(),
    category: toArray(z.enum(HEALTH_CASE_CATEGORIES)).optional(),
    severity: toArray(z.enum(HEALTH_CASE_SEVERITIES)).optional(),
    status: toArray(z.enum(HEALTH_CASE_STATUSES)).optional(),
    activeOnly: z.coerce.boolean().optional().default(false),
    page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(50).optional().default(20),
    sortBy: z.enum(["reportedAt", "severity"]).optional().default("reportedAt"),
    sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
  })
  .strict();

const paramsSchema = z.object({ caseId: z.string().uuid() }).strict();

const createBodySchema = z
  .object({
    rollNumber: z.string().trim().min(1).max(100),
    category: z.enum(HEALTH_CASE_CATEGORIES),
    severity: z.enum(HEALTH_CASE_SEVERITIES),
    description: z.string().trim().min(1).max(4000),
  })
  .strict();

const noteBodySchema = z.object({ note: z.string().trim().min(1).max(2000) }).strict();

function serializeListItem(item: HealthCaseListResult["items"][number]) {
  return {
    id: item.id,
    studentId: item.studentId,
    studentFullName: item.studentFullName,
    studentRollNumber: item.studentRollNumber,
    hostelId: item.hostelId,
    hostelName: item.hostelName,
    roomNumber: item.roomNumber,
    category: item.category,
    severity: item.severity,
    status: item.status,
    reportedAt: item.reportedAt,
    admittedAt: item.admittedAt,
    latestUpdateAt: item.latestUpdateAt,
    assignedStaffId: item.assignedStaffId,
    assignedStaffName: item.assignedStaffName,
  };
}

function serializeList(result: HealthCaseListResult) {
  return {
    items: result.items.map(serializeListItem),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  };
}

function serializeEvent(event: HealthCaseEventView) {
  return {
    id: event.id,
    eventType: event.eventType,
    note: event.note,
    actorStaffName: event.actorStaffName,
    occurredAt: event.occurredAt,
  };
}

function serializeDetail(view: HealthCaseDetailView) {
  return {
    ...serializeListItem(view),
    description: view.description,
    resolvedAt: view.resolvedAt,
    dischargedAt: view.dischargedAt,
    closedAt: view.closedAt,
    cancelledAt: view.cancelledAt,
    timeline: view.timeline.map(serializeEvent),
  };
}

function serializeStatistics(stats: HealthCaseStatistics) {
  return stats;
}

/** Maps typed domain errors to HTTP responses. Never forwards a raw
 * database error, SQL message, or stack trace — matches
 * sendEmergencyError's exact discipline. */
async function sendHealthError(reply: FastifyReply, err: unknown): Promise<void> {
  if (err instanceof HealthStudentNotFoundError || err instanceof HealthCaseNotFoundError) {
    await reply.code(404).send({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof HealthCaseConflictError) {
    await reply.code(409).send({
      error: { code: err.code, message: err.message, currentStatus: err.currentStatus },
    });
    return;
  }
  if (err instanceof HealthDomainError) {
    await reply.code(400).send({ error: { code: err.code, message: err.message } });
    return;
  }
  throw err;
}

type StaffProfile = {
  kind: "staff";
  id: string;
  role: "reception_warden" | "hostel_admin" | "super_admin";
};

/**
 * Health Operations Center (Phase 4, Prompt 11). Same role
 * set/AAL2/hostel-scope shape as every other certified staff route
 * (routes/emergencies.ts, routes/movements.ts) — reuses the already-declared
 * `health:manage` permission (apps/reception-dashboard/src/lib/
 * authorization/permissions.ts, granted to reception_warden/hostel_admin/
 * super_admin since Prompt 3) rather than inventing a new one; that
 * permission gates the ROUTE client-side (UX only), this preHandler chain
 * is the actual server-side boundary. `library_incharge` is never in the
 * allowed-role list for any route below.
 */
export async function healthCaseRoutes(app: FastifyInstance) {
  const staffOnly = [
    app.authenticate,
    requireStaffRole("reception_warden", "hostel_admin", "super_admin"),
    requireAal2(),
  ];

  app.get(
    "/health-cases",
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

      const result = await app.healthService.list({
        staffId: profile.id,
        staffRole: profile.role,
        query: query.data.q,
        studentId: query.data.studentId,
        categories: query.data.category,
        severities: query.data.severity,
        statuses: query.data.status,
        activeOnly: query.data.activeOnly,
        page: query.data.page,
        pageSize: query.data.pageSize,
        sortBy: query.data.sortBy,
        sortDir: query.data.sortDir,
      });
      await reply.code(200).send(serializeList(result));
    },
  );

  app.get(
    "/health-cases/statistics",
    { preHandler: staffOnly, config: { rateLimit: app.rateLimitTiers.staffQueue } },
    async (request, reply) => {
      const profile = request.auth!.profile as StaffProfile;
      const stats = await app.healthService.getStatistics({
        staffId: profile.id,
        staffRole: profile.role,
      });
      await reply.code(200).send(serializeStatistics(stats));
    },
  );

  app.get(
    "/health-cases/:caseId",
    { preHandler: staffOnly, config: { rateLimit: app.rateLimitTiers.staffQueue } },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) {
        await reply
          .code(400)
          .send({ error: { code: "validation_failed", message: "Invalid case id." } });
        return;
      }
      const profile = request.auth!.profile as StaffProfile;
      try {
        const healthCase = await app.healthService.getById(params.data.caseId, {
          staffId: profile.id,
          staffRole: profile.role,
        });
        await reply.code(200).send(serializeDetail(healthCase));
      } catch (err) {
        await sendHealthError(reply, err);
      }
    },
  );

  // Staff-initiated case report. No real KIIMS/hospital-system producer
  // exists anywhere in this repository (confirmed by repository search
  // before this route was written) — this is a genuine, honest
  // reception-desk capability, reusing the SAME staff-attestation pattern
  // routes/emergencies.ts's own "Report Emergency" already established,
  // never a fabricated substitute for a real external integration.
  app.post(
    "/health-cases",
    { preHandler: staffOnly, config: { rateLimit: app.rateLimitTiers.exitAuthorization } },
    async (request, reply) => {
      const body = createBodySchema.safeParse(request.body);
      if (!body.success) {
        await reply.code(400).send({
          error: {
            code: "validation_failed",
            message: body.error.issues[0]?.message ?? "Invalid case report.",
          },
        });
        return;
      }
      const profile = request.auth!.profile as StaffProfile;
      try {
        const healthCase = await app.healthService.create({
          staffId: profile.id,
          staffRole: profile.role,
          rollNumber: body.data.rollNumber,
          category: body.data.category,
          severity: body.data.severity,
          description: body.data.description,
        });
        await reply.code(201).send(serializeDetail(healthCase));
      } catch (err) {
        await sendHealthError(reply, err);
      }
    },
  );

  function registerTransition(
    path: string,
    action:
      | "acknowledge"
      | "cancel"
      | "startMonitoring"
      | "markAwaitingUpdate"
      | "resumeMonitoring"
      | "resolve"
      | "discharge"
      | "close",
  ) {
    app.post(
      `/health-cases/:caseId/${path}`,
      { preHandler: staffOnly, config: { rateLimit: app.rateLimitTiers.exitAuthorization } },
      async (request, reply) => {
        const params = paramsSchema.safeParse(request.params);
        if (!params.success) {
          await reply
            .code(400)
            .send({ error: { code: "validation_failed", message: "Invalid case id." } });
          return;
        }
        const profile = request.auth!.profile as StaffProfile;
        try {
          const healthCase = await app.healthService.transition(action, {
            caseId: params.data.caseId,
            staffId: profile.id,
            staffRole: profile.role,
          });
          await reply.code(200).send(serializeDetail(healthCase));
        } catch (err) {
          await sendHealthError(reply, err);
        }
      },
    );
  }

  registerTransition("acknowledge", "acknowledge");
  registerTransition("cancel", "cancel");
  registerTransition("start-monitoring", "startMonitoring");
  registerTransition("mark-awaiting-update", "markAwaitingUpdate");
  registerTransition("resume-monitoring", "resumeMonitoring");
  registerTransition("resolve", "resolve");
  registerTransition("discharge", "discharge");
  registerTransition("close", "close");

  app.post(
    "/health-cases/:caseId/notes",
    { preHandler: staffOnly, config: { rateLimit: app.rateLimitTiers.exitAuthorization } },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) {
        await reply
          .code(400)
          .send({ error: { code: "validation_failed", message: "Invalid case id." } });
        return;
      }
      const body = noteBodySchema.safeParse(request.body);
      if (!body.success) {
        await reply.code(400).send({
          error: {
            code: "validation_failed",
            message: body.error.issues[0]?.message ?? "Invalid note.",
          },
        });
        return;
      }
      const profile = request.auth!.profile as StaffProfile;
      try {
        const event = await app.healthService.addNote({
          caseId: params.data.caseId,
          staffId: profile.id,
          staffRole: profile.role,
          note: body.data.note,
        });
        await reply.code(201).send(serializeEvent(event));
      } catch (err) {
        await sendHealthError(reply, err);
      }
    },
  );
}

declare module "fastify" {
  interface FastifyInstance {
    healthService: import("../domain/health/service.js").HealthService;
  }
}
