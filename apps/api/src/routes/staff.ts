import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { requireAal2, requireSuperAdmin } from "../lib/auth/guards.js";
import { STAFF_ROLES, STAFF_STATUSES } from "../domain/staff/types.js";
import type {
  StaffListResult,
  StaffListItemView,
  StaffStatisticsView,
} from "../domain/staff/types.js";
import {
  StaffAdminDomainError,
  StaffNotFoundError,
  StaffSelfTargetError,
  StaffLastSuperAdminError,
  StaffDuplicateEmailError,
} from "../domain/staff/errors.js";

const toArray = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]), z.array(schema));

const listQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    role: toArray(z.enum(STAFF_ROLES)).optional(),
    status: toArray(z.enum(STAFF_STATUSES)).optional(),
    hostelId: toArray(z.string().uuid()).optional(),
    page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(50).optional().default(20),
    sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
  })
  .strict();

const paramsSchema = z.object({ staffId: z.string().uuid() }).strict();

const createBodySchema = z
  .object({
    fullName: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(255),
    role: z.enum(STAFF_ROLES),
    hostelId: z.string().uuid().nullable(),
  })
  .strict();

const roleChangeBodySchema = z.object({ role: z.enum(STAFF_ROLES) }).strict();
const hostelChangeBodySchema = z.object({ hostelId: z.string().uuid().nullable() }).strict();
const statusChangeBodySchema = z.object({ status: z.enum(STAFF_STATUSES) }).strict();

function serializeItem(item: StaffListItemView) {
  return {
    id: item.id,
    fullName: item.fullName,
    email: item.email,
    role: item.role,
    hostelId: item.hostelId,
    hostelName: item.hostelName,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function serializeList(result: StaffListResult) {
  return {
    items: result.items.map(serializeItem),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  };
}

function serializeStatistics(stats: StaffStatisticsView) {
  return stats;
}

/** Maps typed domain errors to HTTP responses — never forwards a raw
 * database/Supabase Admin API error, matching `sendEmergencyError`'s exact
 * discipline. */
async function sendStaffAdminError(reply: FastifyReply, err: unknown): Promise<void> {
  if (err instanceof StaffNotFoundError) {
    await reply.code(404).send({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof StaffSelfTargetError) {
    await reply.code(403).send({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof StaffLastSuperAdminError || err instanceof StaffDuplicateEmailError) {
    await reply.code(409).send({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof StaffAdminDomainError) {
    await reply.code(400).send({ error: { code: err.code, message: err.message } });
    return;
  }
  throw err;
}

type StaffProfile = { kind: "staff"; id: string; role: "super_admin" };

/**
 * Identity & Access Administration Center (Phase 5, Prompt 13) — the
 * FIRST `requireSuperAdmin()`-only routes in this codebase (every other
 * staff route in this repository uses the standard 3-role
 * reception_warden/hostel_admin/super_admin set). Matches `staff`'s own
 * pre-existing RLS boundary (`staff_all_super_admin` is the only write
 * grant on this table for any non-self row) exactly — this route family
 * does not grant any authority RLS did not already reserve for
 * super_admin, it only exposes a Fastify path to exercise it.
 *
 * Every mutation route independently re-resolves the caller's own staff
 * identity from `request.auth.profile` (never a client-supplied actor id)
 * and rejects any attempt to target that SAME staff id (§12's explicit
 * self-escalation defense) — enforced in the repository layer, not merely
 * hidden in the UI.
 */
export async function staffRoutes(app: FastifyInstance) {
  const superAdminOnly = [app.authenticate, requireSuperAdmin(), requireAal2()];

  app.get(
    "/staff",
    { preHandler: superAdminOnly, config: { rateLimit: app.rateLimitTiers.staffQueue } },
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
      const result = await app.staffAdminService.list({
        actingStaffId: (request.auth!.profile as StaffProfile).id,
        q: query.data.q,
        role: query.data.role,
        status: query.data.status,
        hostelId: query.data.hostelId,
        page: query.data.page,
        pageSize: query.data.pageSize,
        sortDir: query.data.sortDir,
      });
      await reply.code(200).send(serializeList(result));
    },
  );

  app.get(
    "/staff/statistics",
    { preHandler: superAdminOnly, config: { rateLimit: app.rateLimitTiers.staffQueue } },
    async (_request, reply) => {
      const stats = await app.staffAdminService.getStatistics();
      await reply.code(200).send(serializeStatistics(stats));
    },
  );

  app.get(
    "/staff/:staffId",
    { preHandler: superAdminOnly, config: { rateLimit: app.rateLimitTiers.staffQueue } },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) {
        await reply
          .code(400)
          .send({ error: { code: "validation_failed", message: "Invalid staff id." } });
        return;
      }
      try {
        const found = await app.staffAdminService.getById(params.data.staffId);
        await reply.code(200).send(serializeItem(found));
      } catch (err) {
        await sendStaffAdminError(reply, err);
      }
    },
  );

  app.post(
    "/staff",
    { preHandler: superAdminOnly, config: { rateLimit: app.rateLimitTiers.staffAdmin } },
    async (request, reply) => {
      const body = createBodySchema.safeParse(request.body);
      if (!body.success) {
        await reply.code(400).send({
          error: {
            code: "validation_failed",
            message: body.error.issues[0]?.message ?? "Invalid staff creation request.",
          },
        });
        return;
      }
      const profile = request.auth!.profile as StaffProfile;
      try {
        const created = await app.staffAdminService.create({
          actingStaffId: profile.id,
          fullName: body.data.fullName,
          email: body.data.email,
          role: body.data.role,
          hostelId: body.data.hostelId,
        });
        await reply.code(201).send(serializeItem(created));
      } catch (err) {
        await sendStaffAdminError(reply, err);
      }
    },
  );

  app.patch(
    "/staff/:staffId/role",
    { preHandler: superAdminOnly, config: { rateLimit: app.rateLimitTiers.staffAdmin } },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      const body = roleChangeBodySchema.safeParse(request.body);
      if (!params.success || !body.success) {
        await reply
          .code(400)
          .send({ error: { code: "validation_failed", message: "Invalid role-change request." } });
        return;
      }
      const profile = request.auth!.profile as StaffProfile;
      try {
        const updated = await app.staffAdminService.changeRole({
          actingStaffId: profile.id,
          targetStaffId: params.data.staffId,
          newRole: body.data.role,
        });
        await reply.code(200).send(serializeItem(updated));
      } catch (err) {
        await sendStaffAdminError(reply, err);
      }
    },
  );

  app.patch(
    "/staff/:staffId/hostel",
    { preHandler: superAdminOnly, config: { rateLimit: app.rateLimitTiers.staffAdmin } },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      const body = hostelChangeBodySchema.safeParse(request.body);
      if (!params.success || !body.success) {
        await reply.code(400).send({
          error: { code: "validation_failed", message: "Invalid hostel-change request." },
        });
        return;
      }
      const profile = request.auth!.profile as StaffProfile;
      try {
        const updated = await app.staffAdminService.changeHostel({
          actingStaffId: profile.id,
          targetStaffId: params.data.staffId,
          newHostelId: body.data.hostelId,
        });
        await reply.code(200).send(serializeItem(updated));
      } catch (err) {
        await sendStaffAdminError(reply, err);
      }
    },
  );

  app.patch(
    "/staff/:staffId/status",
    { preHandler: superAdminOnly, config: { rateLimit: app.rateLimitTiers.staffAdmin } },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      const body = statusChangeBodySchema.safeParse(request.body);
      if (!params.success || !body.success) {
        await reply.code(400).send({
          error: { code: "validation_failed", message: "Invalid status-change request." },
        });
        return;
      }
      const profile = request.auth!.profile as StaffProfile;
      try {
        const updated = await app.staffAdminService.changeStatus({
          actingStaffId: profile.id,
          targetStaffId: params.data.staffId,
          newStatus: body.data.status,
        });
        await reply.code(200).send(serializeItem(updated));
      } catch (err) {
        await sendStaffAdminError(reply, err);
      }
    },
  );

  app.post(
    "/staff/:staffId/reset-password",
    { preHandler: superAdminOnly, config: { rateLimit: app.rateLimitTiers.staffAdmin } },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) {
        await reply
          .code(400)
          .send({ error: { code: "validation_failed", message: "Invalid staff id." } });
        return;
      }
      const profile = request.auth!.profile as StaffProfile;
      try {
        await app.staffAdminService.resetPassword({
          actingStaffId: profile.id,
          targetStaffId: params.data.staffId,
        });
        await reply.code(202).send({ status: "reset_email_triggered" });
      } catch (err) {
        await sendStaffAdminError(reply, err);
      }
    },
  );

  app.post(
    "/staff/:staffId/force-sign-out",
    { preHandler: superAdminOnly, config: { rateLimit: app.rateLimitTiers.staffAdmin } },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) {
        await reply
          .code(400)
          .send({ error: { code: "validation_failed", message: "Invalid staff id." } });
        return;
      }
      const profile = request.auth!.profile as StaffProfile;
      try {
        await app.staffAdminService.forceSignOut({
          actingStaffId: profile.id,
          targetStaffId: params.data.staffId,
        });
        await reply.code(202).send({ status: "sessions_revoked" });
      } catch (err) {
        await sendStaffAdminError(reply, err);
      }
    },
  );
}

declare module "fastify" {
  interface FastifyInstance {
    staffAdminService: import("../domain/staff/service.js").StaffAdminService;
  }
}
