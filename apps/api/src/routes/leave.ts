import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  requireActiveTrustedDevice,
  requireParentOrGuardian,
  requireStudent,
} from "../lib/auth/guards.js";
import {
  LeaveBiometricConfirmationError,
  LeaveDomainError,
  LeaveRequestConflictError,
  LeaveRequestNotFoundError,
  LeaveValidationError,
} from "../domain/leave/errors.js";
import type { LeaveRequestView } from "../domain/leave/types.js";

const paramsSchema = z.object({ leaveRequestId: z.string().uuid() }).strict();

// .strict() at both levels — matches the convention already established by
// createLeaveRequestBodySchema below: reject unrecognized fields rather than
// silently stripping them. In particular, this guarantees no client-supplied
// ownership/actor field (e.g. a stray "parentId") is ever silently accepted
// here — there was never a field for one, but strict mode makes that
// invariant enforced rather than incidental.
const decisionBodySchema = z
  .object({
    biometricAssertion: z
      .object({
        assertionToken: z.string().min(1),
        actionId: z.string().min(1),
      })
      .strict(),
  })
  .strict();

// ISO 8601 calendar date (YYYY-MM-DD), matching the schema's `date` columns
// (packages/db/src/schema/leave.ts). Regex alone would accept impossible
// dates like 2026-02-30 — the extra parse round-trip check catches those.
const isoDateSchema = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}, "Must be a valid calendar date in YYYY-MM-DD format.");

// Field limits are an API-layer validation choice (docs/leave-approval-workflow.md)
// — the underlying `reason` column is unconstrained `text`; no schema change
// was made to introduce this limit.
const MAX_REASON_LENGTH = 1000;

const createLeaveRequestBodySchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(1, "reason is required.")
      .max(MAX_REASON_LENGTH, "reason is too long."),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
  })
  .strict()
  .refine((data) => data.endDate >= data.startDate, {
    message: "endDate must not be before startDate.",
    path: ["endDate"],
  });

function serialize(view: LeaveRequestView) {
  return {
    id: view.id,
    studentId: view.studentId,
    reason: view.reason,
    startDate: view.startDate,
    endDate: view.endDate,
    status: view.status,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
  };
}

/** Maps typed domain errors to HTTP responses. Never forwards a raw
 * database error, SQL message, or stack trace — anything not one of these
 * known LeaveDomainError subtypes is treated as unexpected and re-thrown for
 * Fastify's own error handler (which logs server-side, returns a generic
 * 500 with no internal detail — Fastify's default behavior, unmodified). */
async function sendLeaveError(reply: FastifyReply, err: unknown): Promise<void> {
  if (err instanceof LeaveRequestNotFoundError) {
    await reply.code(404).send({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof LeaveRequestConflictError) {
    await reply.code(409).send({
      error: { code: err.code, message: err.message, currentStatus: err.currentStatus },
    });
    return;
  }
  if (err instanceof LeaveBiometricConfirmationError) {
    await reply.code(403).send({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof LeaveValidationError) {
    await reply.code(400).send({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof LeaveDomainError) {
    await reply.code(400).send({ error: { code: err.code, message: err.message } });
    return;
  }
  throw err;
}

export async function leaveRoutes(app: FastifyInstance) {
  app.post(
    "/leave-requests",
    { preHandler: [app.authenticate, requireStudent()] },
    async (request, reply) => {
      const body = createLeaveRequestBodySchema.safeParse(request.body);
      if (!body.success) {
        await reply.code(400).send({
          error: {
            code: "validation_failed",
            message: body.error.issues[0]?.message ?? "Invalid request body.",
          },
        });
        return;
      }

      // requireStudent() already rejected any non-"student" profile before
      // this handler runs. studentId comes ONLY from the authenticated
      // caller's own resolved profile — there is no client-supplied
      // student id field anywhere in this request (Critical Rule).
      const studentId = (request.auth!.profile as { kind: "student"; id: string }).id;

      try {
        const view = await app.leaveService.createForStudent({
          studentId,
          reason: body.data.reason,
          startDate: body.data.startDate,
          endDate: body.data.endDate,
        });
        await reply.code(201).send(serialize(view));
      } catch (err) {
        await sendLeaveError(reply, err);
      }
    },
  );

  app.get(
    "/leave-requests",
    { preHandler: [app.authenticate, requireStudent()] },
    async (request, reply) => {
      const studentId = (request.auth!.profile as { kind: "student"; id: string }).id;
      const views = await app.leaveService.listForStudent(studentId);
      await reply.code(200).send(views.map(serialize));
    },
  );

  app.get(
    "/leave-requests/:leaveRequestId",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) {
        await reply
          .code(400)
          .send({ error: { code: "validation_failed", message: "Invalid leave request id." } });
        return;
      }

      // No role guard in the preHandler chain here — both the owning
      // student and a linked parent/guardian may read a leave request, so
      // the role/ownership branch happens here rather than blocking one of
      // them out before the handler runs. Anti-enumeration (identical
      // not-found behavior for "doesn't exist" vs "exists but not yours")
      // is preserved independently in each branch by the service layer.
      const profile = request.auth!.profile;
      try {
        let view: LeaveRequestView;
        if (profile.kind === "student") {
          view = await app.leaveService.getForStudent(params.data.leaveRequestId, profile.id);
        } else if (profile.kind === "parent") {
          view = await app.leaveService.getForParent(params.data.leaveRequestId, profile.id);
        } else {
          await reply.code(403).send({
            error: {
              code: "role_required",
              message: "Student or parent/guardian role required.",
            },
          });
          return;
        }
        await reply.code(200).send(serialize(view));
      } catch (err) {
        await sendLeaveError(reply, err);
      }
    },
  );

  async function decide(
    leaveRequestId: string,
    parentId: string,
    decision: "approved" | "rejected",
    body: unknown,
    reply: FastifyReply,
  ) {
    const parsedBody = decisionBodySchema.safeParse(body);
    if (!parsedBody.success) {
      await reply.code(400).send({
        error: { code: "validation_failed", message: "biometricAssertion is required." },
      });
      return;
    }

    try {
      const view = await app.leaveService.decide({
        leaveRequestId,
        actingParentId: parentId,
        decision,
        biometricAssertion: parsedBody.data.biometricAssertion,
      });
      await reply.code(200).send(serialize(view));
    } catch (err) {
      await sendLeaveError(reply, err);
    }
  }

  app.post(
    "/leave-requests/:leaveRequestId/approve",
    {
      preHandler: [
        app.authenticate,
        requireParentOrGuardian(),
        requireActiveTrustedDevice(app.authDbPort),
      ],
    },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) {
        await reply
          .code(400)
          .send({ error: { code: "validation_failed", message: "Invalid leave request id." } });
        return;
      }
      await decide(
        params.data.leaveRequestId,
        (request.auth!.profile as { kind: "parent"; id: string }).id,
        "approved",
        request.body,
        reply,
      );
    },
  );

  app.post(
    "/leave-requests/:leaveRequestId/reject",
    {
      preHandler: [
        app.authenticate,
        requireParentOrGuardian(),
        requireActiveTrustedDevice(app.authDbPort),
      ],
    },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) {
        await reply
          .code(400)
          .send({ error: { code: "validation_failed", message: "Invalid leave request id." } });
        return;
      }
      await decide(
        params.data.leaveRequestId,
        (request.auth!.profile as { kind: "parent"; id: string }).id,
        "rejected",
        request.body,
        reply,
      );
    },
  );
}

declare module "fastify" {
  interface FastifyInstance {
    leaveService: import("../domain/leave/service.js").LeaveService;
  }
}
