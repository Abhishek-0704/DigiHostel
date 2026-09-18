import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { requireAal2, requireStaffRole } from "../lib/auth/guards.js";
import {
  MovementConflictError,
  MovementDomainError,
  MovementLeaveRequestNotFoundError,
} from "../domain/movement/errors.js";
import type { HostelReturnView } from "../domain/movement/types.js";

const paramsSchema = z.object({ leaveRequestId: z.string().uuid() }).strict();

// Deliberately narrower than the domain type — never serializes actor
// identity (see HostelReturnView's own doc comment; same discipline as
// serializeExitAuthorization, routes/leave.ts).
function serializeHostelReturn(view: HostelReturnView) {
  return {
    id: view.id,
    leaveRequestId: view.leaveRequestId,
    studentId: view.studentId,
    occurredAt: view.occurredAt,
  };
}

/** Maps typed domain errors to HTTP responses. Never forwards a raw
 * database error, SQL message, or stack trace — matches
 * sendLeaveError/sendStudentError's exact discipline. */
async function sendMovementError(reply: FastifyReply, err: unknown): Promise<void> {
  if (err instanceof MovementLeaveRequestNotFoundError) {
    await reply.code(404).send({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof MovementConflictError) {
    await reply.code(409).send({
      error: { code: err.code, message: err.message, currentStatus: err.currentStatus },
    });
    return;
  }
  if (err instanceof MovementDomainError) {
    await reply.code(400).send({ error: { code: err.code, message: err.message } });
    return;
  }
  throw err;
}

export async function movementRoutes(app: FastifyInstance) {
  // Phase 4, Prompt 9 — Movement Engine / Hostel Return. Same role
  // set/AAL2/hostel-scope shape as every certified staff-only leave-request
  // transition (routes/leave.ts's /expire, /send-for-parent-approval,
  // /exit-authorization) — reuses the already-declared `movement:return`
  // permission (granted to reception_warden/hostel_admin/super_admin since
  // Prompt 3, never previously wired to a real route) rather than inventing
  // a new one; that permission gates the ROUTE client-side (UX only), this
  // preHandler chain is the actual server-side boundary. Requires the
  // referenced leave request to already be `approved` AND to already have a
  // real `leave_exit_authorizations` row — see MovementRepository.
  // recordHostelReturn's own doc comment for why "Exit Authorized" and
  // "Student Actually Exited" are treated as the identical, only
  // authoritative fact this system has (a staff attestation), never
  // silently assumed from `approved` status alone. Colocated under
  // /leave-requests/:id/* (not /students/:rollNumber/return) for the same
  // reason /exit-authorization is: the command targets one specific leave
  // request, exactly like every other staff-only leave-request transition,
  // and the frontend already resolves that id from the student's profile
  // (GET /students/{rollNumber}) before calling this.
  app.post(
    "/leave-requests/:leaveRequestId/return",
    {
      preHandler: [
        app.authenticate,
        requireStaffRole("reception_warden", "hostel_admin", "super_admin"),
        requireAal2(),
      ],
      // Reuses the exit-authorization tier — identical sensitivity/
      // frequency profile (a staff-console action with no legitimate
      // reason to be called many times per minute for the same or
      // different leave requests) — no new tier introduced for a
      // functionally identical shape.
      config: { rateLimit: app.rateLimitTiers.exitAuthorization },
    },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) {
        await reply
          .code(400)
          .send({ error: { code: "validation_failed", message: "Invalid leave request id." } });
        return;
      }

      const profile = request.auth!.profile as {
        kind: "staff";
        id: string;
        role: "reception_warden" | "hostel_admin" | "super_admin";
      };

      try {
        const view = await app.movementService.recordHostelReturn({
          leaveRequestId: params.data.leaveRequestId,
          staffId: profile.id,
          staffRole: profile.role,
        });
        await reply.code(201).send(serializeHostelReturn(view));
      } catch (err) {
        await sendMovementError(reply, err);
      }
    },
  );
}

declare module "fastify" {
  interface FastifyInstance {
    movementService: import("../domain/movement/service.js").MovementService;
  }
}
