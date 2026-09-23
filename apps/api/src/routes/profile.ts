import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { requireStaffRole } from "../lib/auth/guards.js";
import {
  PREFERRED_CONTACT_METHODS,
  THEME_PREFERENCES,
  DENSITY_PREFERENCES,
  FONT_SCALE_PREFERENCES,
  DATE_FORMAT_PREFERENCES,
  DEFAULT_LANDING_PAGE_OPTIONS,
  NOTIFICATION_CATEGORIES,
  MAX_SHORTCUTS,
} from "../domain/profile/types.js";
import type { ProfileView } from "../domain/profile/types.js";
import { ProfileDomainError } from "../domain/profile/errors.js";

const shortcutSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    label: z.string().trim().min(1).max(60),
    // A shortcut is a personalization convenience, never an authorization
    // mechanism (§16) — it may only point at an in-app relative route.
    // RequireRole/RequirePermission still gate the actual destination
    // exactly as if navigation happened via the sidebar; this check exists
    // only to reject an absolute-URL-shaped string, not to validate that
    // the path corresponds to a real route.
    path: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^\/[^:]*$/, 'path must be a relative in-app path starting with "/".'),
  })
  .strict();

const notificationPreferencesSchema = z
  .record(z.enum(NOTIFICATION_CATEGORIES), z.boolean())
  .refine(
    (v) => Object.keys(v).every((k) => (NOTIFICATION_CATEGORIES as readonly string[]).includes(k)),
    {
      message: "Unrecognized notification category.",
    },
  );

const dashboardPreferencesSchema = z
  .object({
    compactMode: z.boolean().optional(),
    widgetVisibility: z.record(z.string().max(100), z.boolean()).optional(),
    savedFilters: z.record(z.string().max(100), z.unknown()).optional(),
  })
  .strict();

const updateBodySchema = z
  .object({
    fullName: z.string().trim().min(1).max(200).optional(),
    phoneNumber: z.string().trim().max(30).nullable().optional(),
    officeLocation: z.string().trim().max(200).nullable().optional(),
    bio: z.string().trim().max(1000).nullable().optional(),
    preferredContactMethod: z.enum(PREFERRED_CONTACT_METHODS).optional(),
    theme: z.enum(THEME_PREFERENCES).optional(),
    density: z.enum(DENSITY_PREFERENCES).optional(),
    fontScale: z.enum(FONT_SCALE_PREFERENCES).optional(),
    dateFormat: z.enum(DATE_FORMAT_PREFERENCES).optional(),
    reducedMotion: z.boolean().optional(),
    highContrast: z.boolean().optional(),
    defaultLandingPage: z.enum(DEFAULT_LANDING_PAGE_OPTIONS).optional(),
    notificationPreferences: notificationPreferencesSchema.optional(),
    dashboardPreferences: dashboardPreferencesSchema.optional(),
    shortcuts: z.array(shortcutSchema).max(MAX_SHORTCUTS).optional(),
  })
  // .strict(): role/hostelId/status/id/authUserId/staffId are not declared
  // above at all, so any attempt to send them is rejected outright with a
  // 400 here — never silently ignored, never reaching the service layer.
  .strict();

function serializeProfile(view: ProfileView) {
  return {
    identity: view.identity,
    preferences: view.preferences,
  };
}

async function sendProfileError(reply: FastifyReply, err: unknown): Promise<void> {
  if (err instanceof ProfileDomainError) {
    await reply.code(400).send({ error: { code: err.code, message: err.message } });
    return;
  }
  throw err;
}

type StaffProfile = { kind: "staff"; id: string };

/**
 * Administrative Profile & Personal Preferences Center (Phase 7, Prompt
 * 17). Every route is self-scoped ONLY — the acting staff id is read
 * exclusively from `request.auth.profile.id` (server-resolved from the
 * verified JWT + a live `staff` row lookup), never from any client-supplied
 * field. No AAL2 requirement (unlike `staffRoutes`/`configurationRoutes`):
 * these are personal, non-privileged preference changes with no
 * cross-account effect, not administrative actions over another identity.
 * No hostel-scope check either — there is nothing to scope, since every
 * operation is already confined to the caller's own row by construction.
 * Open to every staff role, including `library_incharge` (the one role
 * `auditRoutes`/`configurationRoutes` exclude) — personal preferences carry
 * no administrative-permission gate at all.
 */
export async function profileRoutes(app: FastifyInstance) {
  const selfOnly = [
    app.authenticate,
    requireStaffRole("reception_warden", "hostel_admin", "library_incharge", "super_admin"),
  ];

  app.get(
    "/profile",
    { preHandler: selfOnly, config: { rateLimit: app.rateLimitTiers.profile } },
    async (request, reply) => {
      const profile = request.auth!.profile as StaffProfile;
      const view = await app.profileService.getOrCreate(profile.id);
      await reply.code(200).send(serializeProfile(view));
    },
  );

  app.patch(
    "/profile",
    { preHandler: selfOnly, config: { rateLimit: app.rateLimitTiers.profile } },
    async (request, reply) => {
      const body = updateBodySchema.safeParse(request.body);
      if (!body.success) {
        await reply.code(400).send({
          error: {
            code: "validation_failed",
            message: body.error.issues[0]?.message ?? "Invalid profile update request.",
          },
        });
        return;
      }
      const profile = request.auth!.profile as StaffProfile;
      try {
        const updated = await app.profileService.update(profile.id, body.data);
        await reply.code(200).send(serializeProfile(updated));
      } catch (err) {
        await sendProfileError(reply, err);
      }
    },
  );
}

declare module "fastify" {
  interface FastifyInstance {
    profileService: import("../domain/profile/service.js").ProfileService;
  }
}
