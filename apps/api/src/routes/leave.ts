import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  requireAal2,
  requireAal2ForStaffCallers,
  requireActiveTrustedDevice,
  requireParentOrGuardian,
  requireStaffRole,
  requireStudent,
} from "../lib/auth/guards.js";
import {
  ExitAuthorizationConflictError,
  LeaveBiometricConfirmationError,
  LeaveDomainError,
  LeaveRequestConflictError,
  LeaveRequestNotFoundError,
  LeaveValidationError,
} from "../domain/leave/errors.js";
import type {
  ExitAuthorizationView,
  LeaveApprovalEventView,
  LeaveRequestView,
  StaffLeaveQueueItemView,
} from "../domain/leave/types.js";

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

// z.literal(true), not z.boolean() — `identityConfirmed: false` must be
// REJECTED (400), never silently accepted as "not confirmed but proceed
// anyway." `.strict()` guarantees no other field (a forged
// mentorApproved/parentApproved/staffId/studentId/hostelId/role/
// authorizationStatus/exitTimestamp — the exact adversarial payload this
// route's own doc comment names) is ever even parsed, let alone used.
const exitAuthorizationBodySchema = z
  .object({
    identityConfirmed: z.literal(true),
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

// Deliberately narrower than the domain type — never serializes any
// parent identity/contact field (StaffLeaveQueueItemView has none anyway;
// this mirrors serialize()'s explicit-field discipline rather than
// spreading the view).
function serializeQueueItem(view: StaffLeaveQueueItemView) {
  return {
    id: view.id,
    studentId: view.studentId,
    studentRollNumber: view.studentRollNumber,
    studentFullName: view.studentFullName,
    studentHostelId: view.studentHostelId,
    studentHostelName: view.studentHostelName,
    studentRoomId: view.studentRoomId,
    studentRoomNumber: view.studentRoomNumber,
    reason: view.reason,
    startDate: view.startDate,
    endDate: view.endDate,
    status: view.status,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
  };
}

// Deliberately narrower than the domain type — never serializes actor
// identity (see LeaveApprovalEventView's doc comment).
function serializeEvent(view: LeaveApprovalEventView) {
  return {
    id: view.id,
    eventType: view.eventType,
    response: view.response,
    biometricConfirmed: view.biometricConfirmed,
    occurredAt: view.occurredAt,
  };
}

// Deliberately narrower than the domain type — never serializes which
// specific staff member authorized the exit (see ExitAuthorizationView's
// own doc comment; same discipline as serializeEvent above).
function serializeExitAuthorization(view: ExitAuthorizationView) {
  return {
    id: view.id,
    leaveRequestId: view.leaveRequestId,
    identityConfirmed: view.identityConfirmed,
    authorizedAt: view.authorizedAt,
  };
}

/** Maps typed domain errors to HTTP responses. Never forwards a raw
 * database error, SQL message, or stack trace — anything not one of these
 * known LeaveDomainError subtypes is treated as unexpected and re-thrown for
 * the app's own global error handler (lib/errorHandler.ts, registered in
 * app.ts), which logs it server-side and returns a fixed, generic 500 with
 * no internal detail (G-01). */
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
  if (err instanceof ExitAuthorizationConflictError) {
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
    {
      preHandler: [app.authenticate, requireStudent()],
      config: { rateLimit: app.rateLimitTiers.create },
    },
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

  // No role guard in the preHandler chain here — same pattern as
  // GET /leave-requests/:leaveRequestId below: both the owning student
  // (their own requests) and a linked parent/guardian (every linked
  // student's requests, G-05) may call this, so the role branch happens in
  // the handler rather than blocking one of them out beforehand. Unlike the
  // single-id read path, there is no id parameter here for an unrelated
  // caller to probe — an unrelated/unlinked parent simply gets an empty
  // array, never an error, so no anti-enumeration handling is needed.
  app.get("/leave-requests", { preHandler: [app.authenticate] }, async (request, reply) => {
    const profile = request.auth!.profile;
    if (profile.kind === "student") {
      const views = await app.leaveService.listForStudent(profile.id);
      await reply.code(200).send(views.map(serialize));
      return;
    }
    if (profile.kind === "parent") {
      const views = await app.leaveService.listForParent(profile.id);
      await reply.code(200).send(views.map(serialize));
      return;
    }
    await reply.code(403).send({
      error: { code: "role_required", message: "Student or parent/guardian role required." },
    });
  });

  // Reception Dashboard staff queue (Phase 3, Prompt 7A) — the endpoint
  // `apps/reception-dashboard/docs/architecture.md`'s "open decisions" list
  // named as still-missing ("a staff-scoped listing capability"). Registered
  // as a static path ahead of the parametric :leaveRequestId route below;
  // Fastify's underlying router (find-my-way) matches static segments before
  // parametric ones regardless of registration order, but this ordering is
  // kept for readability. requireAal2() composed after the role guard, same
  // reasoning as the /expire route below (a non-staff caller must see
  // role_required, not insufficient_assurance).
  app.get(
    "/leave-requests/queue",
    {
      preHandler: [
        app.authenticate,
        requireStaffRole("reception_warden", "hostel_admin", "super_admin"),
        requireAal2(),
      ],
      config: { rateLimit: app.rateLimitTiers.staffQueue },
    },
    async (request, reply) => {
      const profile = request.auth!.profile as {
        kind: "staff";
        id: string;
        role: "reception_warden" | "hostel_admin" | "super_admin";
      };
      const items = await app.leaveService.getQueueForStaff({
        staffId: profile.id,
        staffRole: profile.role,
      });
      await reply.code(200).send(items.map(serializeQueueItem));
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

  // Approval History (Phase 4 Prompt 10) — read-only, same authorization
  // shape as the GET-by-id route above (owning student OR relationship-
  // checked parent/guardian; identical anti-enumeration 404). Adds no new
  // table/RLS policy — leave_approval_events and its RLS already exist
  // exactly as ADR-015 designed them; this is the missing route ADR-015
  // anticipated ("a parent's approval history view is simply a
  // filtered/joined query over it") but never built.
  //
  // Extended for staff (Phase 3 Prompt 7B — Parent Approval Session
  // Workspace): reception_warden/hostel_admin/super_admin, hostel-scoped via
  // the same findAccessibleLeaveRequestForStaff check listForStaffQueue()/
  // markExpired() already use (library_incharge excluded — no leave_requests
  // RLS grant for that role, matching every other staff-facing leave route).
  // Deliberately NOT built during Prompt 7A: the underlying
  // `leave_approval_events` RLS grant staff would be reading through
  // (`lae_select_staff`) was, at that time, independently found to be
  // unscoped by hostel — a real security gap, remediated and independently
  // re-verified (migration 0010_lae_select_staff_hostel_scope.sql, QG-01
  // re-verification: PASSED) before this staff branch was added. This
  // Fastify route is defense-in-depth on top of that fix, not a substitute
  // for it — the corrected RLS is what actually protects direct
  // PostgREST/Realtime access; this route only adds the missing Fastify
  // read path for the one client (this dashboard) that needs it.
  //
  // requireAal2ForStaffCallers() is composed here (not requireAal2()) since
  // this route is genuinely shared with student/parent callers, who have no
  // AAL2 concept at all — see that guard's own doc comment.
  app.get(
    "/leave-requests/:leaveRequestId/events",
    { preHandler: [app.authenticate, requireAal2ForStaffCallers()] },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) {
        await reply
          .code(400)
          .send({ error: { code: "validation_failed", message: "Invalid leave request id." } });
        return;
      }

      const profile = request.auth!.profile;
      try {
        let events: LeaveApprovalEventView[];
        if (profile.kind === "student") {
          events = await app.leaveService.getEventsForStudent(
            params.data.leaveRequestId,
            profile.id,
          );
        } else if (profile.kind === "parent") {
          events = await app.leaveService.getEventsForParent(
            params.data.leaveRequestId,
            profile.id,
          );
        } else if (
          profile.kind === "staff" &&
          (profile.role === "reception_warden" ||
            profile.role === "hostel_admin" ||
            profile.role === "super_admin")
        ) {
          events = await app.leaveService.getEventsForStaff(params.data.leaveRequestId, {
            staffId: profile.id,
            staffRole: profile.role,
          });
        } else {
          await reply.code(403).send({
            error: {
              code: "role_required",
              message: "Student, parent/guardian, or authorized staff role required.",
            },
          });
          return;
        }
        await reply.code(200).send(events.map(serializeEvent));
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
      config: { rateLimit: app.rateLimitTiers.decision },
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
      config: { rateLimit: app.rateLimitTiers.decision },
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

  // Reception-Initiated Parent Approval correction — the ONLY way a leave
  // request ever leaves `pending`; `create()` no longer schedules any
  // escalation job automatically (see LeaveRepository.create()'s own doc
  // comment for the full before/after account). Same role set, hostel-scope
  // enforcement, and requireAal2() composition-after-role-guard reasoning as
  // `/expire` below (the one other staff-only leave-request transition) —
  // library_incharge is deliberately excluded (no RLS grant on
  // leave_requests for that role).
  app.post(
    "/leave-requests/:leaveRequestId/send-for-parent-approval",
    {
      preHandler: [
        app.authenticate,
        requireStaffRole("reception_warden", "hostel_admin", "super_admin"),
        requireAal2(),
      ],
      config: { rateLimit: app.rateLimitTiers.startParentApproval },
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
        const view = await app.leaveService.startParentApproval({
          leaveRequestId: params.data.leaveRequestId,
          actingStaffId: profile.id,
          actingStaffRole: profile.role,
        });
        await reply.code(200).send(serialize(view));
      } catch (err) {
        await sendLeaveError(reply, err);
      }
    },
  );

  // Staff-only, from manual_verification only (ADR-019 §2) — never a parent
  // action, never automatic. Role set matches the existing
  // leave_requests_all_reception/_hostel_admin/_super_admin RLS grants
  // (packages/db/src/schema/leave.ts); library_incharge is deliberately
  // excluded (no RLS grant on leave_requests for that role). Hostel-scope
  // enforcement for reception_warden/hostel_admin happens in the repository
  // (Fastify's own DB connection bypasses RLS, per repository.ts).
  //
  // requireAal2() (Prompt 3, RBAC & Authorization Framework): this is the
  // one existing staff-facing route in the product, and therefore the one
  // place the Prompt 0.3 ASRB's CRITICAL finding ("a password-only aal1
  // session could call a staff route directly, bypassing the frontend's
  // MFA gate entirely") was concretely, not just hypothetically,
  // exploitable. Composed AFTER requireStaffRole deliberately — a
  // non-staff caller is still rejected with role_required, not
  // insufficient_assurance (see requireAal2's own doc comment).
  app.post(
    "/leave-requests/:leaveRequestId/expire",
    {
      preHandler: [
        app.authenticate,
        requireStaffRole("reception_warden", "hostel_admin", "super_admin"),
        requireAal2(),
      ],
      config: { rateLimit: app.rateLimitTiers.expire },
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
        const view = await app.leaveService.markExpired({
          leaveRequestId: params.data.leaveRequestId,
          actingStaffId: profile.id,
          actingStaffRole: profile.role,
        });
        await reply.code(200).send(serialize(view));
      } catch (err) {
        await sendLeaveError(reply, err);
      }
    },
  );

  // Phase 3, Prompt 7C — Student Verification & Exit Authorization. The
  // final Reception-side checkpoint before a student is permitted to leave
  // the hostel. Same role set/hostel-scope/requireAal2()-after-role-guard
  // shape as /expire and /send-for-parent-approval above — library_incharge
  // deliberately excluded. Requires an explicit `identityConfirmed: true`
  // body field (a staff attestation the server cannot independently
  // re-derive — see AuthorizeExitInput's own doc comment); `.strict()`
  // rejects any other field, so a client cannot smuggle a
  // `mentorApproved`/`parentApproved`/`staffId`/`studentId`/`hostelId`/
  // `role`/`authorizationStatus`/`exitTimestamp` value of any kind — none of
  // those exist as accepted input anywhere on this route. Mentor/SAP
  // approval is deliberately NOT checked here: no SAP integration exists
  // anywhere in this repository (re-confirmed by direct search before this
  // route was written — see apps/reception-dashboard/docs/exit-
  // authorization.md §Mentor/SAP Validation), so this route never claims to
  // have verified it; the repository layer's own `status === "approved"`
  // precondition is the one real, verifiable gate this action enforces.
  app.post(
    "/leave-requests/:leaveRequestId/exit-authorization",
    {
      preHandler: [
        app.authenticate,
        requireStaffRole("reception_warden", "hostel_admin", "super_admin"),
        requireAal2(),
      ],
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
      const body = exitAuthorizationBodySchema.safeParse(request.body);
      if (!body.success) {
        await reply.code(400).send({
          error: {
            code: "validation_failed",
            message: "Student identity must be explicitly confirmed (identityConfirmed: true).",
          },
        });
        return;
      }

      const profile = request.auth!.profile as {
        kind: "staff";
        id: string;
        role: "reception_warden" | "hostel_admin" | "super_admin";
      };

      try {
        const view = await app.leaveService.authorizeExit({
          leaveRequestId: params.data.leaveRequestId,
          actingStaffId: profile.id,
          actingStaffRole: profile.role,
          identityConfirmed: body.data.identityConfirmed,
        });
        await reply.code(201).send(serializeExitAuthorization(view));
      } catch (err) {
        await sendLeaveError(reply, err);
      }
    },
  );
}

declare module "fastify" {
  interface FastifyInstance {
    leaveService: import("../domain/leave/service.js").LeaveService;
  }
}
