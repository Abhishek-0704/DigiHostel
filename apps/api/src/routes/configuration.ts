import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { requireAal2, requireStaffRole } from "../lib/auth/guards.js";
import {
  CONFIGURATION_DOMAINS,
  CONFIGURATION_SCOPES,
  CONFIGURATION_VALUE_TYPES,
} from "../domain/configuration/types.js";
import type {
  ConfigurationListResult,
  ConfigurationEntryView,
  ConfigurationStatisticsView,
  ConfigurationValidateOutcome,
} from "../domain/configuration/types.js";
import {
  ConfigurationDomainError,
  ConfigurationNotFoundError,
  ConfigurationHostelScopeError,
  ConfigurationDuplicateKeyError,
  ConfigurationStaleVersionError,
} from "../domain/configuration/errors.js";

const toArray = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]), z.array(schema));

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema),
  ]),
);

const listQuerySchema = z
  .object({
    domain: toArray(z.enum(CONFIGURATION_DOMAINS)).optional(),
    scope: toArray(z.enum(CONFIGURATION_SCOPES)).optional(),
    hostelId: toArray(z.string().uuid()).optional(),
    isActive: z.coerce.boolean().optional(),
    q: z.string().trim().max(200).optional(),
    page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(50).optional().default(20),
    sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
  })
  .strict();

const paramsSchema = z.object({ entryId: z.string().uuid() }).strict();

const createBodySchema = z
  .object({
    domain: z.enum(CONFIGURATION_DOMAINS),
    key: z.string().trim().min(1).max(100),
    value: jsonValueSchema,
    valueType: z.enum(CONFIGURATION_VALUE_TYPES),
    description: z.string().trim().max(2000).nullable().optional().default(null),
    scope: z.enum(CONFIGURATION_SCOPES),
    hostelId: z.string().uuid().nullable(),
  })
  .strict();

const updateBodySchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    value: jsonValueSchema.optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

const validateBodySchema = z
  .object({
    domain: z.enum(CONFIGURATION_DOMAINS),
    key: z.string().trim().min(1).max(100),
    value: jsonValueSchema,
    valueType: z.enum(CONFIGURATION_VALUE_TYPES),
    scope: z.enum(CONFIGURATION_SCOPES),
    hostelId: z.string().uuid().nullable(),
  })
  .strict();

function serializeEntry(item: ConfigurationEntryView) {
  return item;
}

function serializeList(result: ConfigurationListResult) {
  return {
    items: result.items.map(serializeEntry),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  };
}

function serializeStatistics(stats: ConfigurationStatisticsView) {
  return stats;
}

function serializeValidationOutcome(outcome: ConfigurationValidateOutcome) {
  return {
    valid: outcome.kind === "valid",
    kind: outcome.kind,
    reason: "reason" in outcome ? outcome.reason : null,
  };
}

/** Maps typed domain errors to HTTP responses — never forwards a raw
 * database error, matching `sendStaffAdminError`'s exact discipline. */
async function sendConfigurationError(reply: FastifyReply, err: unknown): Promise<void> {
  if (err instanceof ConfigurationNotFoundError) {
    await reply.code(404).send({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof ConfigurationHostelScopeError) {
    await reply.code(403).send({ error: { code: err.code, message: err.message } });
    return;
  }
  if (
    err instanceof ConfigurationDuplicateKeyError ||
    err instanceof ConfigurationStaleVersionError
  ) {
    await reply.code(409).send({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof ConfigurationDomainError) {
    await reply.code(400).send({ error: { code: err.code, message: err.message } });
    return;
  }
  throw err;
}

type ConfigurationStaffProfile = {
  kind: "staff";
  id: string;
  role: "hostel_admin" | "super_admin";
  hostelId: string | null;
};

/**
 * Enterprise Configuration Center (Phase 5, Prompt 14) — reuses the
 * existing, already-granted `configuration:manage` permission
 * (`hostel_admin`/`super_admin` only, `lib/authorization/policy.ts`, never
 * `reception_warden`/`library_incharge`) and the identical
 * AAL2-required staff-route pattern every other privileged route in this
 * API already establishes. No new role, permission, or authentication
 * mechanism is introduced.
 *
 * Hostel-scope enforcement never trusts a client-supplied hostel id: the
 * acting caller's own `role`/`hostelId` are read exclusively from
 * `request.auth.profile` (server-resolved from the verified JWT + a live
 * `staff` row lookup, `resolveAppProfile`) and passed straight through to
 * the service/repository layer, which is where every hostel-scope decision
 * is actually enforced (`domain/configuration/repository.ts`'s own doc
 * comment).
 */
export async function configurationRoutes(app: FastifyInstance) {
  const configurationManage = [
    app.authenticate,
    requireStaffRole("hostel_admin", "super_admin"),
    requireAal2(),
  ];

  function actor(request: { auth?: { profile: unknown } }): ConfigurationStaffProfile {
    return request.auth!.profile as ConfigurationStaffProfile;
  }

  app.get(
    "/configuration/domains",
    { preHandler: configurationManage, config: { rateLimit: app.rateLimitTiers.staffQueue } },
    async (_request, reply) => {
      await reply.code(200).send({ domains: CONFIGURATION_DOMAINS });
    },
  );

  app.get(
    "/configuration/statistics",
    { preHandler: configurationManage, config: { rateLimit: app.rateLimitTiers.staffQueue } },
    async (request, reply) => {
      const profile = actor(request);
      const stats = await app.configurationService.getStatistics(profile.role, profile.hostelId);
      await reply.code(200).send(serializeStatistics(stats));
    },
  );

  app.get(
    "/configuration",
    { preHandler: configurationManage, config: { rateLimit: app.rateLimitTiers.staffQueue } },
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
      const profile = actor(request);
      const result = await app.configurationService.list({
        actingStaffId: profile.id,
        actingRole: profile.role,
        actingHostelId: profile.hostelId,
        domain: query.data.domain,
        scope: query.data.scope,
        hostelId: query.data.hostelId,
        isActive: query.data.isActive,
        q: query.data.q,
        page: query.data.page,
        pageSize: query.data.pageSize,
        sortDir: query.data.sortDir,
      });
      await reply.code(200).send(serializeList(result));
    },
  );

  app.get(
    "/configuration/:entryId",
    { preHandler: configurationManage, config: { rateLimit: app.rateLimitTiers.staffQueue } },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) {
        await reply.code(400).send({
          error: { code: "validation_failed", message: "Invalid configuration entry id." },
        });
        return;
      }
      const profile = actor(request);
      try {
        const found = await app.configurationService.getById(
          params.data.entryId,
          profile.role,
          profile.hostelId,
        );
        await reply.code(200).send(serializeEntry(found));
      } catch (err) {
        await sendConfigurationError(reply, err);
      }
    },
  );

  app.post(
    "/configuration/validate",
    {
      preHandler: configurationManage,
      config: { rateLimit: app.rateLimitTiers.configurationAdmin },
    },
    async (request, reply) => {
      const body = validateBodySchema.safeParse(request.body);
      if (!body.success) {
        await reply.code(400).send({
          error: {
            code: "validation_failed",
            message: body.error.issues[0]?.message ?? "Invalid validation request.",
          },
        });
        return;
      }
      const outcome = await app.configurationService.validate(body.data);
      await reply.code(200).send(serializeValidationOutcome(outcome));
    },
  );

  app.post(
    "/configuration",
    {
      preHandler: configurationManage,
      config: { rateLimit: app.rateLimitTiers.configurationAdmin },
    },
    async (request, reply) => {
      const body = createBodySchema.safeParse(request.body);
      if (!body.success) {
        await reply.code(400).send({
          error: {
            code: "validation_failed",
            message: body.error.issues[0]?.message ?? "Invalid configuration creation request.",
          },
        });
        return;
      }
      const profile = actor(request);
      try {
        const created = await app.configurationService.create({
          actingStaffId: profile.id,
          actingRole: profile.role,
          actingHostelId: profile.hostelId,
          domain: body.data.domain,
          key: body.data.key,
          value: body.data.value,
          valueType: body.data.valueType,
          description: body.data.description ?? null,
          scope: body.data.scope,
          hostelId: body.data.hostelId,
        });
        await reply.code(201).send(serializeEntry(created));
      } catch (err) {
        await sendConfigurationError(reply, err);
      }
    },
  );

  app.patch(
    "/configuration/:entryId",
    {
      preHandler: configurationManage,
      config: { rateLimit: app.rateLimitTiers.configurationAdmin },
    },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      const body = updateBodySchema.safeParse(request.body);
      if (!params.success || !body.success) {
        await reply.code(400).send({
          error: { code: "validation_failed", message: "Invalid configuration update request." },
        });
        return;
      }
      const profile = actor(request);
      try {
        const updated = await app.configurationService.update({
          actingStaffId: profile.id,
          actingRole: profile.role,
          actingHostelId: profile.hostelId,
          entryId: params.data.entryId,
          expectedVersion: body.data.expectedVersion,
          value: body.data.value,
          description: body.data.description,
          isActive: body.data.isActive,
        });
        await reply.code(200).send(serializeEntry(updated));
      } catch (err) {
        await sendConfigurationError(reply, err);
      }
    },
  );
}

declare module "fastify" {
  interface FastifyInstance {
    configurationService: import("../domain/configuration/service.js").ConfigurationService;
  }
}
