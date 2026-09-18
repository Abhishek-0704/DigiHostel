import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAal2, requireStaffRole } from "../lib/auth/guards.js";
import { REPORT_IDS, type ReportId } from "../domain/reports/types.js";
import {
  MAX_ANALYTICS_RANGE_DAYS,
  DEFAULT_ANALYTICS_RANGE_DAYS,
} from "../domain/analytics/types.js";
import type { ReportPreviewResult, ReportDefinition } from "../domain/reports/types.js";

type ReportsProfile = {
  kind: "staff";
  id: string;
  role: "hostel_admin" | "super_admin";
  hostelId: string | null;
};

function defaultRange(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const from = new Date(now.getTime() - DEFAULT_ANALYTICS_RANGE_DAYS * 24 * 60 * 60 * 1000);
  return { dateFrom: from.toISOString(), dateTo: now.toISOString() };
}

// Both-or-neither, dateFrom <= dateTo, span <= MAX_ANALYTICS_RANGE_DAYS —
// the exact same date-range contract routes/analytics.ts's rangeQuerySchema
// already established (Prompt 16 §11: one consistent server-side date
// interpretation platform-wide).
const dateRangeSchema = z
  .object({
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
  })
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

// .strict() throughout, matching every other staff-facing endpoint in this
// codebase — an unrecognized field is rejected with 400, never silently
// ignored. No `hostelId` field exists anywhere in this schema (Prompt 16
// §18/§35's explicit "a client MUST NOT be able to expand scope" rule) —
// there is nothing for a forged value to override.
const previewBodySchema = z
  .object({
    reportId: z.enum(REPORT_IDS),
    filters: z
      .object({
        dateFrom: z.string().datetime().optional(),
        dateTo: z.string().datetime().optional(),
        statuses: z.array(z.string().max(60)).max(50).optional(),
        categories: z.array(z.string().max(60)).max(50).optional(),
        severities: z.array(z.string().max(60)).max(50).optional(),
        eventTypes: z.array(z.string().max(60)).max(50).optional(),
        modules: z.array(z.string().max(60)).max(50).optional(),
      })
      .strict()
      .default({}),
    selectedFields: z.array(z.string().max(80)).max(50).optional(),
    sortField: z.string().max(80).optional(),
    sortDir: z.enum(["asc", "desc"]).optional(),
    page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(50).optional().default(20),
  })
  .strict();

const templateCreateSchema = z
  .object({
    reportId: z.enum(REPORT_IDS),
    name: z.string().trim().min(1).max(120),
    filters: z.record(z.unknown()).default({}),
    selectedFields: z.array(z.string().max(80)).max(50).default([]),
    isFavorite: z.boolean().optional().default(false),
  })
  .strict();

const templateUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    filters: z.record(z.unknown()).optional(),
    selectedFields: z.array(z.string().max(80)).max(50).optional(),
    isFavorite: z.boolean().optional(),
  })
  .strict();

/** Validates every client-supplied multi_select filter value against that
 * report's OWN server-declared `availableFilters[].options` — never an open
 * string, and never a value the report definition itself doesn't recognize
 * (Prompt 16 §9's "no fabricated fields/filters" rule, enforced here rather
 * than only documented). Returns the first violation message, or null. */
function validateFiltersAgainstDefinition(
  def: ReportDefinition,
  filters: Record<string, unknown>,
): string | null {
  for (const filterDef of def.availableFilters) {
    if (filterDef.type !== "multi_select" || !filterDef.options) continue;
    const value = filters[filterDef.id];
    if (value === undefined) continue;
    if (!Array.isArray(value)) return `${filterDef.id} must be an array.`;
    for (const v of value) {
      if (!filterDef.options.includes(String(v))) {
        return `${filterDef.id} contains an unrecognized value: ${String(v)}.`;
      }
    }
  }
  // Reject any filter key the report doesn't declare at all.
  const knownKeys = new Set(["dateFrom", "dateTo", ...def.availableFilters.map((f) => f.id)]);
  for (const key of Object.keys(filters)) {
    if (!knownKeys.has(key)) return `Filter "${key}" is not supported by this report.`;
  }
  return null;
}

function validateSelectedFields(def: ReportDefinition, selectedFields?: string[]): string | null {
  if (!selectedFields || selectedFields.length === 0) return null;
  const known = new Set(def.availableFields.map((f) => f.id));
  for (const id of selectedFields) {
    if (!known.has(id)) return `Field "${id}" is not available on this report.`;
  }
  return null;
}

function serializePreview(result: ReportPreviewResult) {
  return result;
}

/**
 * Enterprise Reporting Platform (Phase 6, Prompt 16) — reuses the existing
 * `reports:view`/`reports:generate` permission boundary (granted only to
 * `hostel_admin`/`super_admin` since Prompt 3, `reports:generate` since
 * this same prompt's own reconnaissance found it already declared but never
 * wired to any route), AAL2-required, matching every other staff-facing
 * route in this codebase. The backend enforces authorization by ROLE
 * (`requireStaffRole`), identically to every other domain — the frontend's
 * finer-grained `reports:view`/`reports:generate` split is a UX-layer
 * convenience only, never the actual security boundary (matching this
 * codebase's own established, explicitly-documented division of labor —
 * `apps/reception-dashboard/src/lib/authorization/policy.ts`'s own doc
 * comment).
 *
 * Every route below is either read-only (catalog, preview, templates GET,
 * history) or scoped to the caller's OWN saved templates (create/update/
 * delete) — no route mutates any operational table. Hostel scope is
 * resolved entirely server-side from the caller's own resolved staff
 * profile inside `domain/reports/repository.ts`'s `scopeCondition()` (for
 * the four new report queries) or the corresponding reused domain's own
 * established scope check (Emergency/Health/Audit/Analytics) — never a
 * client-supplied filter, and no `hostelId` field exists anywhere in this
 * route's request schemas for a forged value to override.
 */
export async function reportsRoutes(app: FastifyInstance) {
  const reportsOnly = [
    app.authenticate,
    requireStaffRole("hostel_admin", "super_admin"),
    requireAal2(),
  ];

  app.get(
    "/reports/catalog",
    { preHandler: reportsOnly, config: { rateLimit: app.rateLimitTiers.staffQueue } },
    async (_request, reply) => {
      await reply.code(200).send({ reports: app.reportsService.getCatalog() });
    },
  );

  app.post(
    "/reports/:reportId/preview",
    { preHandler: reportsOnly, config: { rateLimit: app.rateLimitTiers.staffQueue } },
    async (request, reply) => {
      const params = z.object({ reportId: z.enum(REPORT_IDS) }).safeParse(request.params);
      const body = previewBodySchema.safeParse(request.body);
      if (!params.success || !body.success) {
        await reply.code(400).send({
          error: {
            code: "validation_failed",
            message:
              params.error?.issues[0]?.message ??
              body.error?.issues[0]?.message ??
              "Invalid request.",
          },
        });
        return;
      }
      if (params.data.reportId !== body.data.reportId) {
        await reply.code(400).send({
          error: { code: "validation_failed", message: "reportId in path and body must match." },
        });
        return;
      }

      const def = app.reportsService.getCatalog().find((d) => d.id === params.data.reportId);
      if (!def) {
        await reply.code(404).send({ error: { code: "not_found", message: "Unknown report." } });
        return;
      }
      if (def.status === "unavailable") {
        await reply.code(409).send({
          error: {
            code: "report_unavailable",
            message: def.unavailableReason ?? "This report is not currently available.",
          },
        });
        return;
      }

      const dateRange = dateRangeSchema.safeParse(body.data.filters);
      if (!dateRange.success) {
        await reply.code(400).send({
          error: {
            code: "validation_failed",
            message: dateRange.error.issues[0]?.message ?? "Invalid date range.",
          },
        });
        return;
      }
      const filterError = validateFiltersAgainstDefinition(def, body.data.filters);
      if (filterError) {
        await reply.code(400).send({ error: { code: "validation_failed", message: filterError } });
        return;
      }
      const fieldError = validateSelectedFields(def, body.data.selectedFields);
      if (fieldError) {
        await reply.code(400).send({ error: { code: "validation_failed", message: fieldError } });
        return;
      }
      if (body.data.sortField && !def.sortFields.some((s) => s.id === body.data.sortField)) {
        await reply.code(400).send({
          error: {
            code: "validation_failed",
            message: "sortField is not supported by this report.",
          },
        });
        return;
      }

      const profile = request.auth!.profile as ReportsProfile;
      const { dateFrom, dateTo } = body.data.filters.dateFrom
        ? { dateFrom: body.data.filters.dateFrom, dateTo: body.data.filters.dateTo! }
        : def.availableFilters.some((f) => f.type === "date_range")
          ? defaultRange()
          : { dateFrom: undefined, dateTo: undefined };

      const result = await app.reportsService.preview({
        reportId: params.data.reportId,
        staffId: profile.id,
        staffRole: profile.role,
        filters: { ...body.data.filters, dateFrom, dateTo },
        selectedFields: body.data.selectedFields,
        sortField: body.data.sortField,
        sortDir: body.data.sortDir,
        page: body.data.page,
        pageSize: body.data.pageSize,
      });

      await app.reportsService.recordExecution(
        { staffId: profile.id, staffRole: profile.role, hostelScopeId: profile.hostelId },
        params.data.reportId,
        { ...body.data.filters, dateFrom, dateTo },
        result.total,
      );

      await reply.code(200).send(serializePreview(result));
    },
  );

  app.get(
    "/reports/templates",
    { preHandler: reportsOnly, config: { rateLimit: app.rateLimitTiers.staffQueue } },
    async (request, reply) => {
      const profile = request.auth!.profile as ReportsProfile;
      const templates = await app.reportsService.listTemplates({
        staffId: profile.id,
        staffRole: profile.role,
      });
      await reply.code(200).send({ templates });
    },
  );

  app.post(
    "/reports/templates",
    { preHandler: reportsOnly, config: { rateLimit: app.rateLimitTiers.configurationAdmin } },
    async (request, reply) => {
      const body = templateCreateSchema.safeParse(request.body);
      if (!body.success) {
        await reply.code(400).send({
          error: {
            code: "validation_failed",
            message: body.error.issues[0]?.message ?? "Invalid template.",
          },
        });
        return;
      }
      const def = app.reportsService.getCatalog().find((d) => d.id === body.data.reportId);
      if (!def || def.status === "unavailable") {
        await reply.code(400).send({
          error: { code: "validation_failed", message: "Unknown or unavailable report." },
        });
        return;
      }
      const filterError = validateFiltersAgainstDefinition(
        def,
        body.data.filters as Record<string, unknown>,
      );
      if (filterError) {
        await reply.code(400).send({ error: { code: "validation_failed", message: filterError } });
        return;
      }
      const fieldError = validateSelectedFields(def, body.data.selectedFields);
      if (fieldError) {
        await reply.code(400).send({ error: { code: "validation_failed", message: fieldError } });
        return;
      }

      const profile = request.auth!.profile as ReportsProfile;
      const outcome = await app.reportsService.createTemplate({
        staffId: profile.id,
        staffRole: profile.role,
        reportId: body.data.reportId,
        name: body.data.name,
        filters: body.data.filters as never,
        selectedFields: body.data.selectedFields,
        isFavorite: body.data.isFavorite,
      });
      if (outcome.kind === "success") {
        await reply.code(201).send(outcome.template);
        return;
      }
      // "not_found" cannot occur for a create — createTemplate() shares
      // ReportTemplateMutationOutcome with update/delete only for type
      // reuse; handled defensively rather than asserted unreachable.
      await reply.code(409).send({
        error: { code: "duplicate_name", message: "You already have a template with this name." },
      });
    },
  );

  app.patch(
    "/reports/templates/:templateId",
    { preHandler: reportsOnly, config: { rateLimit: app.rateLimitTiers.configurationAdmin } },
    async (request, reply) => {
      const params = z.object({ templateId: z.string().uuid() }).safeParse(request.params);
      const body = templateUpdateSchema.safeParse(request.body);
      if (!params.success || !body.success) {
        await reply.code(400).send({
          error: {
            code: "validation_failed",
            message:
              params.error?.issues[0]?.message ??
              body.error?.issues[0]?.message ??
              "Invalid request.",
          },
        });
        return;
      }
      const profile = request.auth!.profile as ReportsProfile;
      const outcome = await app.reportsService.updateTemplate({
        staffId: profile.id,
        staffRole: profile.role,
        templateId: params.data.templateId,
        name: body.data.name,
        filters: body.data.filters as never,
        selectedFields: body.data.selectedFields,
        isFavorite: body.data.isFavorite,
      });
      if (outcome.kind === "not_found") {
        await reply
          .code(404)
          .send({ error: { code: "not_found", message: "Template not found." } });
        return;
      }
      if (outcome.kind === "duplicate_name") {
        await reply.code(409).send({
          error: { code: "duplicate_name", message: "You already have a template with this name." },
        });
        return;
      }
      await reply.code(200).send(outcome.template);
    },
  );

  app.delete(
    "/reports/templates/:templateId",
    { preHandler: reportsOnly, config: { rateLimit: app.rateLimitTiers.configurationAdmin } },
    async (request, reply) => {
      const params = z.object({ templateId: z.string().uuid() }).safeParse(request.params);
      if (!params.success) {
        await reply
          .code(400)
          .send({ error: { code: "validation_failed", message: "Invalid template id." } });
        return;
      }
      const profile = request.auth!.profile as ReportsProfile;
      const outcome = await app.reportsService.deleteTemplate(
        { staffId: profile.id, staffRole: profile.role },
        params.data.templateId,
      );
      if (outcome.kind === "not_found") {
        await reply
          .code(404)
          .send({ error: { code: "not_found", message: "Template not found." } });
        return;
      }
      await reply.code(204).send();
    },
  );

  app.get(
    "/reports/history",
    { preHandler: reportsOnly, config: { rateLimit: app.rateLimitTiers.staffQueue } },
    async (request, reply) => {
      const query = z
        .object({ limit: z.coerce.number().int().min(1).max(100).optional().default(20) })
        .strict()
        .safeParse(request.query);
      if (!query.success) {
        await reply
          .code(400)
          .send({ error: { code: "validation_failed", message: "Invalid limit." } });
        return;
      }
      const profile = request.auth!.profile as ReportsProfile;
      const history = await app.reportsService.listHistory(
        { staffId: profile.id, staffRole: profile.role },
        query.data.limit,
      );
      await reply.code(200).send({ history });
    },
  );
}

declare module "fastify" {
  interface FastifyInstance {
    reportsService: import("../domain/reports/service.js").ReportsServicePort;
  }
}

export type { ReportId };
