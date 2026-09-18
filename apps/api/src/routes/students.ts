import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { requireAal2, requireStaffRole } from "../lib/auth/guards.js";
import { StudentDomainError, StudentNotFoundError } from "../domain/student/errors.js";
import type {
  StudentSearchResult,
  StudentSearchResultItem,
  StudentProfileView,
} from "../domain/student/types.js";

// .strict() throughout, matching routes/leave.ts's established convention —
// an unrecognized query/param field is rejected with 400, not silently
// ignored.
const searchQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(50).optional().default(20),
    sortBy: z.enum(["fullName", "rollNumber"]).optional().default("fullName"),
    sortDir: z.enum(["asc", "desc"]).optional().default("asc"),
  })
  .strict();

const profileParamsSchema = z
  .object({
    rollNumber: z.string().trim().min(1).max(100),
  })
  .strict();

// Deliberately narrower than the domain type — never serializes hostelId/
// roomId as anything other than opaque display-support ids (already true of
// the domain type; this function exists for symmetry with every other
// routes/*.ts serializer, §14's data-minimization requirement made
// explicit at the one place a future field addition to the domain type
// could otherwise leak through un-reviewed).
function serializeSearchItem(item: StudentSearchResultItem) {
  return {
    id: item.id,
    rollNumber: item.rollNumber,
    fullName: item.fullName,
    hostelId: item.hostelId,
    hostelName: item.hostelName,
    roomId: item.roomId,
    roomNumber: item.roomNumber,
  };
}

function serializeSearchResult(result: StudentSearchResult) {
  return {
    items: result.items.map(serializeSearchItem),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  };
}

function serializeProfile(profile: StudentProfileView) {
  return {
    id: profile.id,
    rollNumber: profile.rollNumber,
    fullName: profile.fullName,
    hostelId: profile.hostelId,
    hostelName: profile.hostelName,
    roomId: profile.roomId,
    roomNumber: profile.roomNumber,
    guardians: profile.guardians,
    currentLeave: profile.currentLeave,
    // Never actor identity — same discipline as GET /leave-requests/:id/events.
    timeline: profile.timeline,
    // Server-derived only (repository.ts) — never a client-influenced value.
    hostelPresence: profile.hostelPresence,
  };
}

/** Maps typed domain errors to HTTP responses. Never forwards a raw
 * database error, SQL message, or stack trace — matches sendLeaveError's
 * exact discipline (routes/leave.ts). */
async function sendStudentError(reply: FastifyReply, err: unknown): Promise<void> {
  if (err instanceof StudentNotFoundError) {
    await reply.code(404).send({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof StudentDomainError) {
    await reply.code(400).send({ error: { code: err.code, message: err.message } });
    return;
  }
  throw err;
}

export async function studentRoutes(app: FastifyInstance) {
  // Student Operations Center (Phase 4, Prompt 8). Same role
  // set/AAL2/hostel-scope shape as every certified staff route in
  // routes/leave.ts (`/queue`, `/exit-authorization`, etc.) — reuses the
  // already-declared `student:search` permission (apps/reception-dashboard/
  // src/lib/authorization/permissions.ts, granted to reception_warden/
  // hostel_admin/super_admin since Prompt 3) rather than inventing a new
  // one; that permission gates the ROUTE client-side (UX only), this
  // preHandler chain is the actual server-side boundary. Hostel scope is
  // resolved from the caller's own authenticated staff identity
  // (DrizzleStudentRepository's hostelScopedForStaff) — never a
  // client-supplied hostelId/staffId/role.
  app.get(
    "/students",
    {
      preHandler: [
        app.authenticate,
        requireStaffRole("reception_warden", "hostel_admin", "super_admin"),
        requireAal2(),
      ],
      config: { rateLimit: app.rateLimitTiers.staffQueue },
    },
    async (request, reply) => {
      const query = searchQuerySchema.safeParse(request.query);
      if (!query.success) {
        await reply.code(400).send({
          error: {
            code: "validation_failed",
            message: query.error.issues[0]?.message ?? "Invalid search parameters.",
          },
        });
        return;
      }

      const profile = request.auth!.profile as {
        kind: "staff";
        id: string;
        role: "reception_warden" | "hostel_admin" | "super_admin";
      };

      const result = await app.studentService.search({
        staffId: profile.id,
        staffRole: profile.role,
        query: query.data.q,
        page: query.data.page,
        pageSize: query.data.pageSize,
        sortBy: query.data.sortBy,
        sortDir: query.data.sortDir,
      });
      await reply.code(200).send(serializeSearchResult(result));
    },
  );

  app.get(
    "/students/:rollNumber",
    {
      preHandler: [
        app.authenticate,
        requireStaffRole("reception_warden", "hostel_admin", "super_admin"),
        requireAal2(),
      ],
      config: { rateLimit: app.rateLimitTiers.staffQueue },
    },
    async (request, reply) => {
      const params = profileParamsSchema.safeParse(request.params);
      if (!params.success) {
        await reply
          .code(400)
          .send({ error: { code: "validation_failed", message: "Invalid roll number." } });
        return;
      }

      const profile = request.auth!.profile as {
        kind: "staff";
        id: string;
        role: "reception_warden" | "hostel_admin" | "super_admin";
      };

      try {
        const view = await app.studentService.getProfileByRollNumber(params.data.rollNumber, {
          staffId: profile.id,
          staffRole: profile.role,
        });
        await reply.code(200).send(serializeProfile(view));
      } catch (err) {
        await sendStudentError(reply, err);
      }
    },
  );
}

declare module "fastify" {
  interface FastifyInstance {
    studentService: import("../domain/student/service.js").StudentService;
  }
}
