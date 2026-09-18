import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireParentOrGuardian } from "../lib/auth/guards.js";

/**
 * ADR-003 implementation — the two backend-owned endpoints the mobile
 * client's `registerCurrentDevice()` (src/services/devices/devices.ts) calls
 * through. Both require an authenticated parent/guardian session
 * (`app.authenticate` + `requireParentOrGuardian()`) — unlike auth.ts's
 * pre-session OTP endpoints, device registration only ever happens after a
 * real Supabase session already exists.
 */

const platformSchema = z.enum(["android", "ios"]);

const challengeBodySchema = z
  .object({
    platform: platformSchema,
  })
  .strict();

const registerBodySchema = z
  .object({
    challengeId: z.string().uuid("challengeId must be a valid id."),
    platform: platformSchema,
    attestationToken: z.string().min(1, "attestationToken is required."),
    deviceFingerprint: z.string().min(1, "deviceFingerprint is required."),
  })
  .strict();

const FAILURE_STATUS: Record<string, number> = {
  challenge_not_found: 401,
  attestation_provider_not_configured: 503,
  attestation_rejected: 403,
  attestation_verification_error: 502,
};

const FAILURE_MESSAGE: Record<string, string> = {
  challenge_not_found: "Invalid, expired, or already-used registration challenge.",
  attestation_provider_not_configured: "Device attestation is not available in this environment.",
  attestation_rejected: "Device attestation was rejected.",
  attestation_verification_error: "Device attestation could not be verified. Try again.",
};

export async function deviceRoutes(app: FastifyInstance) {
  app.post(
    "/devices/challenge",
    {
      preHandler: [app.authenticate, requireParentOrGuardian()],
      config: { rateLimit: app.rateLimitTiers.deviceChallenge },
    },
    async (request, reply) => {
      const body = challengeBodySchema.safeParse(request.body);
      if (!body.success) {
        await reply.code(400).send({
          error: {
            code: "validation_failed",
            message: body.error.issues[0]?.message ?? "Invalid request body.",
          },
        });
        return;
      }

      const parentId = (request.auth!.profile as { kind: "parent"; id: string }).id;
      const result = await app.deviceRegistrationService.createChallenge(
        parentId,
        body.data.platform,
      );
      await reply.code(200).send(result);
    },
  );

  app.post(
    "/devices/register",
    {
      preHandler: [app.authenticate, requireParentOrGuardian()],
      config: { rateLimit: app.rateLimitTiers.deviceRegister },
    },
    async (request, reply) => {
      const body = registerBodySchema.safeParse(request.body);
      if (!body.success) {
        await reply.code(400).send({
          error: {
            code: "validation_failed",
            message: body.error.issues[0]?.message ?? "Invalid request body.",
          },
        });
        return;
      }

      const parentId = (request.auth!.profile as { kind: "parent"; id: string }).id;
      const result = await app.deviceRegistrationService.registerDevice({
        parentId,
        challengeId: body.data.challengeId,
        platform: body.data.platform,
        attestationToken: body.data.attestationToken,
        deviceFingerprint: body.data.deviceFingerprint,
      });

      if (result.kind === "failure") {
        const statusCode = FAILURE_STATUS[result.reason] ?? 403;
        await reply.code(statusCode).send({
          error: {
            code: result.reason,
            message: FAILURE_MESSAGE[result.reason] ?? "Device registration failed.",
          },
        });
        return;
      }

      await reply.code(200).send(result.device);
    },
  );
}
