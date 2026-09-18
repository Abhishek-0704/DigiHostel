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

    const profile = await resolveAppProfile(claims.sub, dbPort, claims.iat);
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

/**
 * AAL2 (MFA-verified session) gate — Prompt 3, RBAC & Authorization
 * Framework, closing the CRITICAL finding from the Prompt 0.3 ASRB review:
 * "apps/api has zero AAL/AMR awareness anywhere... a password-only (aal1)
 * session with a valid JWT could call [a staff route] directly, bypassing
 * the frontend's MFA gate entirely." Frontend authorization
 * (apps/reception-dashboard's RequireAuth) is UX only; this is the actual
 * security boundary for ADR-024's "AAL2 required for protected staff
 * operations" decision.
 *
 * Reads `request.auth.claims.aal` directly from the verified JWT — never
 * re-derived from Postgres, since AAL is a session/identity fact Supabase
 * Auth itself asserts (see types.ts's doc comment on `SupabaseJwtClaims`).
 * Fails closed on anything other than an exact `"aal2"` match, including a
 * missing/undefined claim — never treats "we couldn't determine the
 * assurance level" as sufficient.
 *
 * Deliberately NOT part of `authenticate()` or bundled into every staff
 * guard: AAL2 is specific to Supabase's password+MFA staff flow (ADR-024),
 * not a universal requirement for every authenticated caller (parents use
 * an entirely different device-trust/biometric model, ADR-003/ADR-014, with
 * no AAL2 concept at all) — composing this guard is a per-route decision,
 * same as `requireStaffScopeForStudentHostel`. Compose it AFTER a role
 * guard (e.g. `requireStaffRole`), not before: a non-staff caller should
 * still be rejected with "role_required", not "insufficient_assurance" —
 * this guard is about how STRONGLY a staff member proved their identity,
 * not who is allowed to attempt the route at all.
 */
export function requireAal2() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Matches getProfile()'s own "guard used without authenticate() first"
    // check above — a preHandler-ordering bug should surface loudly in
    // development/tests, not silently degrade to a 403.
    if (!request.auth) {
      throw new Error(
        "requireAal2 used without authenticate() running first — check preHandler order",
      );
    }
    if (request.auth.claims.aal !== "aal2") {
      await reply.code(403).send({
        error: forbidden(
          "insufficient_assurance",
          "This action requires multi-factor authentication to be completed.",
        ),
      });
    }
  };
}

/**
 * Conditional AAL2 gate for routes shared by staff AND non-staff callers
 * (Phase 3, Prompt 7B). `requireAal2()` cannot be composed unconditionally
 * on such a route — a parent/student caller has no AAL2 concept at all
 * (ADR-003/ADR-014's device-trust model, not Supabase MFA) and would be
 * wrongly rejected. This guard is a no-op for any non-staff profile,
 * exactly like `requireAal2()` for every staff-only route: fails closed on
 * anything other than an exact `"aal2"` match, including a missing/
 * undefined claim.
 */
export function requireAal2ForStaffCallers() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const profile = getProfile(request);
    if (profile.kind !== "staff") return;
    if (request.auth!.claims.aal !== "aal2") {
      await reply.code(403).send({
        error: forbidden(
          "insufficient_assurance",
          "This action requires multi-factor authentication to be completed.",
        ),
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
