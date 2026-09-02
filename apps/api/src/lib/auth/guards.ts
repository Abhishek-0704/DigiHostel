import type { FastifyReply, FastifyRequest } from "fastify";
import { extractBearerToken, JwtVerificationError, type JwtVerifier } from "./jwt.js";
import { resolveAppProfile } from "./profile.js";
import type { AuthDbPort } from "./db-port.js";
import type { AppProfile, StaffRole } from "./types.js";

/**
 * Fastify authorization boundary (docs/auth-database-security-model.md §16).
 * Two layers, always in this order:
 *   1. authenticate() — is this a valid, current Supabase session at all?
 *   2. the specific guard(s) a route composes — is THIS caller allowed to do
 *      THIS specific thing, checked against live PostgreSQL state, never a
 *      JWT claim beyond coarse role/own-id (the Critical Rule).
 *
 * Error responses never include token contents, claim values, or internal
 * error detail — only a stable `code` and a generic message, per this
 * task's "do not expose debug token contents in production responses/logs"
 * requirement. Verification failures ARE logged server-side (via
 * request.log) with the specific `code` for observability, but the JWT
 * itself is never logged.
 */

const UNAUTHENTICATED = { code: "unauthenticated", message: "Authentication required." };
const NO_APP_PROFILE = {
  code: "no_app_profile",
  message: "Valid session, but no DigiHostel profile is associated with this account.",
};

function forbidden(code: string, message: string) {
  return { code, message };
}

/** Builds the base `authenticate` preHandler: verifies the JWT, resolves the
 * app profile, and populates `request.auth`. Every other guard in this file
 * assumes this has already run and rejected unauthenticated/profile-less
 * requests — compose it first in every protected route's preHandler chain. */
export function createAuthenticate(jwtVerifier: JwtVerifier, dbPort: AuthDbPort) {
  return async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    let token: string;
    try {
      token = extractBearerToken(request.headers.authorization);
    } catch (err) {
      request.log.info({ code: (err as JwtVerificationError).code }, "auth: rejected");
      await reply.code(401).send({ error: UNAUTHENTICATED });
      return;
    }

    let claims;
    try {
      claims = await jwtVerifier.verify(token);
    } catch (err) {
      const code = err instanceof JwtVerificationError ? err.code : "verification_failed";
      request.log.info({ code }, "auth: rejected");
      await reply.code(401).send({ error: UNAUTHENTICATED });
      return;
    }

    const profile = await resolveAppProfile(claims.sub, dbPort);
    if (profile.kind === "none") {
      // Deliberately still 401, not 403: this is "we don't know who you are
      // as a DigiHostel user yet," not "we know you and you lack
      // permission" — see profile.ts's doc comment and this task's request
      // to distinguish the two states cleanly.
      request.log.info({ userId: claims.sub }, "auth: valid session, no app profile");
      await reply.code(401).send({ error: NO_APP_PROFILE });
      return;
    }

    request.auth = { userId: claims.sub, claims, profile };
  };
}

function getProfile(request: FastifyRequest): AppProfile {
  if (!request.auth) {
    throw new Error("Guard used without authenticate() running first — check preHandler order");
  }
  return request.auth.profile;
}

export function requireStudent() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (getProfile(request).kind !== "student") {
      await reply.code(403).send({ error: forbidden("role_required", "Student role required.") });
    }
  };
}

/** Parent OR guardian at the identity level — both are `parents` rows,
 * distinguished only per-relationship (relationship_type), never as
 * separate identities (docs/database-schema-design.md). Use
 * requireLinkedToStudent alongside this for any route scoped to a specific
 * student — this guard alone only proves "some parent/guardian," not "the
 * right one." */
export function requireParentOrGuardian() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (getProfile(request).kind !== "parent") {
      await reply
        .code(403)
        .send({ error: forbidden("role_required", "Parent or guardian role required.") });
    }
  };
}

export function requireStaffRole(...roles: StaffRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const profile = getProfile(request);
    if (profile.kind !== "staff" || !roles.includes(profile.role)) {
      await reply.code(403).send({
        error: forbidden("role_required", `Staff role required: ${roles.join(" or ")}.`),
      });
    }
  };
}

export const requireReception = () => requireStaffRole("reception_warden");
export const requireLibraryIncharge = () => requireStaffRole("library_incharge");
export const requireHostelAdmin = () => requireStaffRole("hostel_admin");
export const requireSuperAdmin = () => requireStaffRole("super_admin");

/**
 * RELATIONSHIP check, not a role check — per this task's explicit
 * requirement, "role checks must not replace relationship checks." A caller
 * with a valid `parent` profile is only authorized for a SPECIFIC student if
 * `parent_student_relationships` actually links them (docs/rls-policy-matrix.md
 * — mirrors the same check RLS independently enforces at the database
 * layer, so this remains defense-in-depth, not the only line of defense).
 * `getStudentId` reads the target student id from wherever the route puts it
 * (params, body, a prior lookup) — kept generic so this guard composes with
 * any route shape.
 */
export function requireLinkedToStudent(
  dbPort: AuthDbPort,
  getStudentId: (request: FastifyRequest) => string,
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const profile = getProfile(request);
    if (profile.kind !== "parent") {
      await reply
        .code(403)
        .send({ error: forbidden("role_required", "Parent or guardian role required.") });
      return;
    }
    const studentId = getStudentId(request);
    const linked = await dbPort.isParentLinkedToStudent(profile.id, studentId);
    if (!linked) {
      await reply.code(403).send({
        error: forbidden(
          "relationship_required",
          "No parent/guardian relationship exists with this student.",
        ),
      });
    }
  };
}

/**
 * Staff SCOPE check (not just role) — reception_warden and hostel_admin are
 * scoped to their own hostel (docs/rls-policy-matrix.md); library_incharge
 * and super_admin are not hostel-scoped. `getStudentHostelId` reads the
 * target student's hostel id from wherever the route resolves it.
 */
export function requireStaffScopeForStudentHostel(
  getStudentHostelId: (request: FastifyRequest) => string | null,
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const profile = getProfile(request);
    if (profile.kind !== "staff") {
      await reply.code(403).send({ error: forbidden("role_required", "Staff role required.") });
      return;
    }
    if (profile.role === "library_incharge" || profile.role === "super_admin") {
      return; // not hostel-scoped
    }
    const targetHostelId = getStudentHostelId(request);
    if (!targetHostelId || profile.hostelId !== targetHostelId) {
      await reply
        .code(403)
        .send({ error: forbidden("scope_required", "Student is outside your assigned hostel.") });
    }
  };
}

/**
 * Device-trust gate: denies a parent/guardian whose every trusted device has
 * been revoked, even with an otherwise-valid Supabase session — the same
 * residual-access-token-window defense RLS enforces at the database layer
 * for leave_approval_events inserts (docs/adr/ADR-014's security
 * implications; docs/rls-policy-matrix.md). Real, DB-backed check — not a
 * placeholder (see security-gates.ts for what IS still a placeholder:
 * attestation and biometric freshness specifically).
 */
export function requireActiveTrustedDevice(dbPort: AuthDbPort) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const profile = getProfile(request);
    if (profile.kind !== "parent") {
      await reply
        .code(403)
        .send({ error: forbidden("role_required", "Parent or guardian role required.") });
      return;
    }
    const hasDevice = await dbPort.hasActiveTrustedDevice(profile.id);
    if (!hasDevice) {
      await reply.code(403).send({
        error: forbidden("device_revoked", "No currently-trusted device is registered."),
      });
    }
  };
}
