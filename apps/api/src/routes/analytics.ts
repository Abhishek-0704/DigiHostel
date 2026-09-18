import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAal2, requireStaffRole } from "../lib/auth/guards.js";
import {
  DEFAULT_ANALYTICS_RANGE_DAYS,
  MAX_ANALYTICS_RANGE_DAYS,
  type AnalyticsOverview,
  type LeaveTrendResult,
  type MovementTrendResult,
} from "../domain/analytics/types.js";

type AnalyticsProfile = { kind: "staff"; id: string; role: "hostel_admin" | "super_admin" };

function defaultRange(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const from = new Date(now.getTime() - DEFAULT_ANALYTICS_RANGE_DAYS * 24 * 60 * 60 * 1000);
  return { dateFrom: from.toISOString(), dateTo: now.toISOString() };
}

// .strict() throughout, matching routes/audit.ts/routes/emergencies.ts's
// established convention — an unrecognized query field is rejected with
// 400, not silently ignored. Both bounds optional (default: the trailing
// DEFAULT_ANALYTICS_RANGE_DAYS window) but if either is supplied, both must
// be — a half-open client-supplied range would be ambiguous.
const rangeQuerySchema = z
  .object({
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
  })
  .strict()
  .refine((v) => (v.dateFrom === undefined) === (v.dateTo === undefined), {
    message: "dateFrom and dateTo must both be supplied, or both omitted.",
  })
  .refine((v) => !v.dateFrom || !v.dateTo || v.dateFrom <= v.dateTo, {
    message: "dateFrom must not be after dateTo.",
  })
  .refine(
    (v) => {
      if (!v.dateFrom || !v.dateTo) return true;
      const spanMs = new Date(v.dateTo).getTime() - new Date(v.dateFrom).getTime();
      return spanMs <= MAX_ANALYTICS_RANGE_DAYS * 24 * 60 * 60 * 1000;
    },
    { message: `The selected range must not exceed ${MAX_ANALYTICS_RANGE_DAYS} days.` },
  );

function serializeOverview(o: AnalyticsOverview) {
  return o;
}
function serializeLeaveTrend(t: LeaveTrendResult) {
  return t;
}
function serializeMovementTrend(t: MovementTrendResult) {
  return t;
}

/**
 * Operational Intelligence & Executive Analytics Dashboard (Phase 6,
 * Prompt 15) — reuses the existing `reports:view` permission boundary
 * (granted only to `hostel_admin`/`super_admin` since Prompt 3 — a
 * `reception_warden` session is denied here exactly as it is denied the
 * frontend nav item), AAL2-required, matching every other staff-facing
 * analytics/statistics route in this codebase (`/staff/statistics`,
 * `/audit/statistics`, `/emergencies/statistics`, `/health-cases/statistics`).
 *
 * Read-only by construction (Prompt 15 §24) — every route below is a GET,
 * none mutates any table. Hostel scope is resolved entirely server-side
 * from the caller's own resolved staff profile (never a client-supplied
 * filter) inside `domain/analytics/repository.ts`'s `scopeCondition()`.
 */
export async function analyticsRoutes(app: FastifyInstance) {
  const analyticsOnly = [
    app.authenticate,
    requireStaffRole("hostel_admin", "super_admin"),
    requireAal2(),
  ];

  app.get(
    "/analytics/overview",
    { preHandler: analyticsOnly, config: { rateLimit: app.rateLimitTiers.staffQueue } },
    async (request, reply) => {
      const query = rangeQuerySchema.safeParse(request.query);
      if (!query.success) {
        await reply.code(400).send({
          error: {
            code: "validation_failed",
            message: query.error.issues[0]?.message ?? "Invalid date range.",
          },
        });
        return;
      }
      const profile = request.auth!.profile as AnalyticsProfile;
      const { dateFrom, dateTo } = query.data.dateFrom
        ? { dateFrom: query.data.dateFrom, dateTo: query.data.dateTo! }
        : defaultRange();
      const overview = await app.analyticsService.getOverview({
        staffId: profile.id,
        staffRole: profile.role,
        dateFrom,
        dateTo,
      });
      await reply.code(200).send(serializeOverview(overview));
    },
  );

  app.get(
    "/analytics/leave-trend",
    { preHandler: analyticsOnly, config: { rateLimit: app.rateLimitTiers.staffQueue } },
    async (request, reply) => {
      const query = rangeQuerySchema.safeParse(request.query);
      if (!query.success) {
        await reply.code(400).send({
          error: {
            code: "validation_failed",
            message: query.error.issues[0]?.message ?? "Invalid date range.",
          },
        });
        return;
      }
      const profile = request.auth!.profile as AnalyticsProfile;
      const { dateFrom, dateTo } = query.data.dateFrom
        ? { dateFrom: query.data.dateFrom, dateTo: query.data.dateTo! }
        : defaultRange();
      const trend = await app.analyticsService.getLeaveTrend({
        staffId: profile.id,
        staffRole: profile.role,
        dateFrom,
        dateTo,
      });
      await reply.code(200).send(serializeLeaveTrend(trend));
    },
  );

  app.get(
    "/analytics/movement-trend",
    { preHandler: analyticsOnly, config: { rateLimit: app.rateLimitTiers.staffQueue } },
    async (request, reply) => {
      const query = rangeQuerySchema.safeParse(request.query);
      if (!query.success) {
        await reply.code(400).send({
          error: {
            code: "validation_failed",
            message: query.error.issues[0]?.message ?? "Invalid date range.",
          },
        });
        return;
      }
      const profile = request.auth!.profile as AnalyticsProfile;
      const { dateFrom, dateTo } = query.data.dateFrom
        ? { dateFrom: query.data.dateFrom, dateTo: query.data.dateTo! }
        : defaultRange();
      const trend = await app.analyticsService.getMovementTrend({
        staffId: profile.id,
        staffRole: profile.role,
        dateFrom,
        dateTo,
      });
      await reply.code(200).send(serializeMovementTrend(trend));
    },
  );
}

declare module "fastify" {
  interface FastifyInstance {
    analyticsService: import("../domain/analytics/service.js").AnalyticsService;
  }
}
