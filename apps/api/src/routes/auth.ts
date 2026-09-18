import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PARENT_RELATIONSHIP_TYPES } from "../domain/auth/types.js";
import { requireStaffRole } from "../lib/auth/guards.js";
import { recordStaffAuthEvent, type StaffAuthAuditEvent } from "../domain/auth/staffAuthAudit.js";

const STAFF_AUTH_AUDIT_EVENTS = [
  "sign_in_success",
  "mfa_success",
  "mfa_failure",
  "sign_out",
] as const;

const staffAuthEventBodySchema = z
  .object({
    event: z.enum(STAFF_AUTH_AUDIT_EVENTS, {
      errorMap: () => ({ message: `event must be one of ${STAFF_AUTH_AUDIT_EVENTS.join(", ")}.` }),
    }),
  })
  .strict();

// .strict() rejects any unrecognized field outright — in particular, this is
// what makes a client-supplied "phone" field a hard 400 rather than a
// silently-ignored one (F-02's core requirement: the client must never be
// able to supply, let alone override, the authoritative phone number).
const requestOtpBodySchema = z
  .object({
    rollNumber: z.string().trim().min(1, "rollNumber is required."),
    relationshipType: z.enum(PARENT_RELATIONSHIP_TYPES as [string, ...string[]], {
      errorMap: () => ({ message: "relationshipType must be one of father, mother, guardian." }),
    }),
  })
  .strict();

const verifyOtpBodySchema = z
  .object({
    challengeId: z.string().uuid("challengeId must be a valid id."),
    code: z.string().trim().min(1, "code is required."),
  })
  .strict();

/**
 * F-02 remediation (PRR Phase 13) — the ADR-020-required eligibility gate in
 * front of Supabase's native phone-OTP flow. Deliberately NOT behind
 * `app.authenticate`: these are the pre-authentication login endpoints
 * themselves (a caller has no session yet). Both responses are constant-shape
 * regardless of eligibility/correctness — see AuthOtpService's own doc
 * comments for the anti-enumeration reasoning this route relies on.
 */
export async function authRoutes(app: FastifyInstance) {
  app.post(
    "/auth/otp/request",
    { config: { rateLimit: app.rateLimitTiers.otpRequest } },
    async (request, reply) => {
      const body = requestOtpBodySchema.safeParse(request.body);
      if (!body.success) {
        await reply.code(400).send({
          error: {
            code: "validation_failed",
            message: body.error.issues[0]?.message ?? "Invalid request body.",
          },
        });
        return;
      }

      const result = await app.authOtpService.requestOtp(
        body.data.rollNumber,
        body.data.relationshipType as (typeof PARENT_RELATIONSHIP_TYPES)[number],
      );
      await reply.code(200).send(result);
    },
  );

  app.post(
    "/auth/otp/verify",
    { config: { rateLimit: app.rateLimitTiers.otpVerify } },
    async (request, reply) => {
      const body = verifyOtpBodySchema.safeParse(request.body);
      if (!body.success) {
        await reply.code(400).send({
          error: {
            code: "validation_failed",
            message: body.error.issues[0]?.message ?? "Invalid request body.",
          },
        });
        return;
      }

      const result = await app.authOtpService.verifyOtp(body.data.challengeId, body.data.code);
      if (!result) {
        // One generic, enumeration-safe response for every failure case —
        // unknown/expired/exhausted/ineligible challenge, or a genuinely
        // wrong/expired code. Never distinguishes which.
        await reply.code(401).send({
          error: { code: "otp_verification_failed", message: "Invalid or expired code." },
        });
        return;
      }

      await reply.code(200).send(result);
    },
  );

  // Reception Dashboard Prompt 1 (Authentication Infrastructure) — see
  // openapi.yaml's operation description and staffAuthAudit.ts's doc
  // comment for why this exists and which events it does/doesn't cover.
  // Any staff role may report its own auth events here (not just the three
  // Reception Dashboard roles) — this endpoint grants no dashboard access,
  // it only records that something already happened at the IdP level.
  app.post(
    "/auth/staff/audit-events",
    {
      preHandler: [
        app.authenticate,
        requireStaffRole("reception_warden", "hostel_admin", "super_admin", "library_incharge"),
      ],
      config: { rateLimit: app.rateLimitTiers.staffAuthAudit },
    },
    async (request, reply) => {
      const body = staffAuthEventBodySchema.safeParse(request.body);
      if (!body.success) {
        await reply.code(400).send({
          error: {
            code: "validation_failed",
            message: body.error.issues[0]?.message ?? "Invalid request body.",
          },
        });
        return;
      }

      const profile = request.auth!.profile as { kind: "staff"; id: string };
      await recordStaffAuthEvent(profile.id, body.data.event as StaffAuthAuditEvent);
      await reply.code(204).send();
    },
  );
}
