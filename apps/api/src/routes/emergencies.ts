import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { requireAal2, requireStaffRole } from "../lib/auth/guards.js";
import {
  EmergencyDomainError,
  EmergencyStudentNotFoundError,
  EmergencyIncidentNotFoundError,
  EmergencyConflictError,
} from "../domain/emergency/errors.js";
import {
  EMERGENCY_CATEGORIES,
  EMERGENCY_SEVERITIES,
  EMERGENCY_STATUSES,
} from "../domain/emergency/types.js";
import type {
  EmergencyListResult,
  EmergencyDetailView,
  EmergencyStatistics,
  EmergencyEventView,
} from "../domain/emergency/types.js";

// Fastify's default query-string parser produces a bare string for a
// single repeated param (`?category=medical`) and only an array when the
// param repeats (`?category=medical&category=fire`) — this coerces both
// shapes to an array before validating each element against the enum.
const toArray = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]), z.array(schema));

// .strict() throughout, matching routes/students.ts/routes/leave.ts's
// established convention — an unrecognized query/body field is rejected
// with 400, not silently ignored.
const listQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    category: toArray(z.enum(EMERGENCY_CATEGORIES)).optional(),
    severity: toArray(z.enum(EMERGENCY_SEVERITIES)).optional(),
    status: toArray(z.enum(EMERGENCY_STATUSES)).optional(),
    activeOnly: z.coerce.boolean().optional().default(false),
    page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(50).optional().default(20),
    sortBy: z.enum(["reportedAt", "severity"]).optional().default("reportedAt"),
    sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
  })
  .strict();

const paramsSchema = z.object({ incidentId: z.string().uuid() }).strict();

const createBodySchema = z
  .object({
    rollNumber: z.string().trim().min(1).max(100),
    category: z.enum(EMERGENCY_CATEGORIES),
    severity: z.enum(EMERGENCY_SEVERITIES),
    description: z.string().trim().min(1).max(4000),
  })
  .strict();

const noteBodySchema = z.object({ note: z.string().trim().min(1).max(2000) }).strict();

function serializeListItem(item: EmergencyListResult["items"][number]) {
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
    assignedStaffId: item.assignedStaffId,
    assignedStaffName: item.assignedStaffName,
  };
}

function serializeList(result: EmergencyListResult) {
  return {
    items: result.items.map(serializeListItem),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  };
}

function serializeEvent(event: EmergencyEventView) {
  return {
    id: event.id,
    eventType: event.eventType,
    note: event.note,
    actorStaffName: event.actorStaffName,
    occurredAt: event.occurredAt,
  };
}

function serializeDetail(view: EmergencyDetailView) {
  return {
    ...serializeListItem(view),
    description: view.description,
    resolvedAt: view.resolvedAt,
    closedAt: view.closedAt,
    timeline: view.timeline.map(serializeEvent),
  };
}

function serializeStatistics(stats: EmergencyStatistics) {
  return stats;
}

/** Maps typed domain errors to HTTP responses. Never forwards a raw
 * database error, SQL message, or stack trace — matches sendStudentError's/
 * sendMovementError's exact discipline. */
async function sendEmergencyError(reply: FastifyReply, err: unknown): Promise<void> {
  if (
    err instanceof EmergencyStudentNotFoundError ||
    err instanceof EmergencyIncidentNotFoundError
  ) {
    await reply.code(404).send({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof EmergencyConflictError) {
    await reply.code(409).send({
      error: { code: err.code, message: err.message, currentStatus: err.currentStatus },
    });
    return;
  }
  if (err instanceof EmergencyDomainError) {
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
 * Emergency Operations Center (Phase 4, Prompt 10). Same role
 * set/AAL2/hostel-scope shape as every other certified staff route
 * (routes/students.ts, routes/movements.ts) — reuses the already-declared
 * `emergency:manage` permission (apps/reception-dashboard/src/lib/
 * authorization/permissions.ts, granted to reception_warden/hostel_admin/
 * super_admin since Prompt 3) rather than inventing a new one; that
 * permission gates the ROUTE client-side (UX only), this preHandler chain
 * is the actual server-side boundary. `library_incharge` is never in the
 * allowed-role list for any route below — it has no product reason to
 * manage a medical/fire/violence/etc. incident (see the RLS narrowing in
 * migration 0017's own doc comment for the matching database-level
 * defense).
 */
export async function emergencyRoutes(app: FastifyInstance) {
  const staffOnly = [
    app.authenticate,
    requireStaffRole("reception_warden", "hostel_admin", "super_admin"),
    requireAal2(),
  ];

  app.get(
    "/emergencies",
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

      const result = await app.emergencyService.list({
        staffId: profile.id,
        staffRole: profile.role,
        query: query.data.q,
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
    "/emergencies/statistics",
    { preHandler: staffOnly, config: { rateLimit: app.rateLimitTiers.staffQueue } },
    async (request, reply) => {
      const profile = request.auth!.profile as StaffProfile;
      const stats = await app.emergencyService.getStatistics({
        staffId: profile.id,
        staffRole: profile.role,
      });
      await reply.code(200).send(serializeStatistics(stats));
    },
  );

  app.get(
    "/emergencies/:incidentId",
    { preHandler: staffOnly, config: { rateLimit: app.rateLimitTiers.staffQueue } },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) {
        await reply
          .code(400)
          .send({ error: { code: "validation_failed", message: "Invalid incident id." } });
        return;
      }
      const profile = request.auth!.profile as StaffProfile;
      try {
        const incident = await app.emergencyService.getById(params.data.incidentId, {
          staffId: profile.id,
          staffRole: profile.role,
        });
        await reply.code(200).send(serializeDetail(incident));
      } catch (err) {
        await sendEmergencyError(reply, err);
      }
    },
  );

  // Staff-initiated incident report. The intended Student App -> Emergency
  // Trigger -> Incident pipeline (SDD Ch.4) has no real implementation
  // anywhere in this repository (apps/student-mobile is Prompt 0.2's
  // unmodified template scaffold — confirmed by repository search before
  // this route was written) — this is a genuine, honest reception-desk
  // capability ("a call comes in, a warden logs it"), reusing the SAME
  // `manual_flag`-style staff-attestation concept this table's original two
  // incident types already established, never a fabricated substitute for
  // the Student App trigger.
  app.post(
    "/emergencies",
    { preHandler: staffOnly, config: { rateLimit: app.rateLimitTiers.exitAuthorization } },
    async (request, reply) => {
      const body = createBodySchema.safeParse(request.body);
      if (!body.success) {
        await reply.code(400).send({
          error: {
            code: "validation_failed",
            message: body.error.issues[0]?.message ?? "Invalid incident report.",
          },
        });
        return;
      }
      const profile = request.auth!.profile as StaffProfile;
      try {
        const incident = await app.emergencyService.create({
          staffId: profile.id,
          staffRole: profile.role,
          rollNumber: body.data.rollNumber,
          category: body.data.category,
          severity: body.data.severity,
          description: body.data.description,
        });
        await reply.code(201).send(serializeDetail(incident));
      } catch (err) {
        await sendEmergencyError(reply, err);
      }
    },
  );

  function registerTransition(
    path: string,
    action: "acknowledge" | "startResponse" | "resolve" | "close",
  ) {
    app.post(
      `/emergencies/:incidentId/${path}`,
      { preHandler: staffOnly, config: { rateLimit: app.rateLimitTiers.exitAuthorization } },
      async (request, reply) => {
        const params = paramsSchema.safeParse(request.params);
        if (!params.success) {
          await reply
            .code(400)
            .send({ error: { code: "validation_failed", message: "Invalid incident id." } });
          return;
        }
        const profile = request.auth!.profile as StaffProfile;
        try {
          const incident = await app.emergencyService.transition(action, {
            incidentId: params.data.incidentId,
            staffId: profile.id,
            staffRole: profile.role,
          });
          await reply.code(200).send(serializeDetail(incident));
        } catch (err) {
          await sendEmergencyError(reply, err);
        }
      },
    );
  }

  registerTransition("acknowledge", "acknowledge");
  registerTransition("start-response", "startResponse");
  registerTransition("resolve", "resolve");
  registerTransition("close", "close");

  app.post(
    "/emergencies/:incidentId/notes",
    { preHandler: staffOnly, config: { rateLimit: app.rateLimitTiers.exitAuthorization } },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) {
        await reply
          .code(400)
          .send({ error: { code: "validation_failed", message: "Invalid incident id." } });
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
        const event = await app.emergencyService.addNote({
          incidentId: params.data.incidentId,
          staffId: profile.id,
          staffRole: profile.role,
          note: body.data.note,
        });
        await reply.code(201).send(serializeEvent(event));
      } catch (err) {
        await sendEmergencyError(reply, err);
      }
    },
  );
}

declare module "fastify" {
  interface FastifyInstance {
    emergencyService: import("../domain/emergency/service.js").EmergencyService;
  }
}
