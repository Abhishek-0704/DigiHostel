import {
  and,
  eq,
  isNull,
  lte,
  or,
  db,
  students,
  parents,
  staff,
  parentStudentRelationships,
  trustedDevices,
} from "@digihostel/db";
import type { StaffRole } from "./types.js";

/**
 * Narrow port over the exact queries the auth boundary needs — deliberately
 * NOT a generic "give me a db client" escape hatch. Real implementation
 * below is backed by @digihostel/db (packages/db, Drizzle + Supabase
 * Postgres per ADR-006/ADR-014). A fake implementing this same interface is
 * used in tests (see the various *.test.ts files in this directory) so auth
 * logic can be tested deterministically without a live database connection.
 *
 * Every method here mirrors a relationship the RLS policies in
 * docs/rls-policy-matrix.md also enforce — this is the Fastify-side half of
 * the same defense-in-depth model (docs/auth-database-security-model.md
 * §15-§16): even if a bug here let something through, RLS is still the
 * final backstop on the actual database operation.
 */
export interface AuthDbPort {
  findStudentByAuthUserId(
    authUserId: string,
  ): Promise<{ id: string; hostelId: string | null } | null>;
  findParentByAuthUserId(authUserId: string): Promise<{ id: string } | null>;
  /**
   * `tokenIssuedAtSeconds` — the presented JWT's own `iat` claim (seconds
   * since epoch). QG-04 remediation, F-QG04-02: a staff member's session
   * can now be invalidated server-side (`staff.sessions_invalidated_before`,
   * set by Force Sign-Out) without waiting for the JWT's own `exp` — a
   * token issued BEFORE that timestamp must be rejected even though it is
   * still cryptographically valid and unexpired. Reuses the identical
   * per-request, fail-closed resolution point `status = 'active'` already
   * established for suspension, rather than adding a second check
   * elsewhere.
   */
  findStaffByAuthUserId(
    authUserId: string,
    tokenIssuedAtSeconds: number,
  ): Promise<{ id: string; role: StaffRole; hostelId: string | null } | null>;
  isParentLinkedToStudent(parentId: string, studentId: string): Promise<boolean>;
  hasActiveTrustedDevice(parentId: string): Promise<boolean>;
}

export class DrizzleAuthDbPort implements AuthDbPort {
  async findStudentByAuthUserId(authUserId: string) {
    const rows = await db
      .select({ id: students.id, hostelId: students.hostelId })
      .from(students)
      .where(eq(students.authUserId, authUserId))
      .limit(1);
    return rows[0] ?? null;
  }

  async findParentByAuthUserId(authUserId: string) {
    const rows = await db
      .select({ id: parents.id })
      .from(parents)
      .where(eq(parents.authUserId, authUserId))
      .limit(1);
    return rows[0] ?? null;
  }

  async findStaffByAuthUserId(authUserId: string, tokenIssuedAtSeconds: number) {
    // Phase 5, Prompt 13 — `status = 'active'` is the actual, request-time
    // enforcement point for staff suspension: a suspended staff member's
    // row simply stops matching this query, so THIS call (made on every
    // authenticated request via the `authenticate` preHandler) returns null
    // and the request fails closed with 401 `no_app_profile` — regardless
    // of how long their already-issued Supabase JWT remains technically
    // valid. Not a new mechanism; reuses this exact existing resolution
    // path unmodified in shape.
    //
    // QG-04 remediation, F-QG04-02: the SAME resolution point now also
    // enforces Force Sign-Out. `sessionsInvalidatedBefore IS NULL` (never
    // invalidated) OR the JWT's own `iat` is AT OR AFTER the invalidation
    // timestamp (a genuinely new session obtained after the force-sign-out)
    // passes; a token issued strictly BEFORE the invalidation timestamp —
    // the exact case a compromised/stale session presents — fails this
    // query and the request is rejected 401 `no_app_profile`, identically
    // to a suspended account.
    //
    // Deliberately NOT `date_trunc('second', ...)`-symmetric: a JWT's
    // `iat` claim (RFC 7519) is a whole-second integer, while
    // `sessions_invalidated_before` is a real `timestamptz` with
    // microsecond precision. An EARLIER version of this comparison
    // truncated `sessions_invalidated_before` down to the same
    // whole-second resolution before comparing, to stop a genuinely-new
    // session issued a few hundred ms after Force Sign-Out (same
    // wall-clock second) from being incorrectly rejected — but doing so
    // live-reproduced a WORSE, genuinely fail-OPEN regression during this
    // remediation's own verification: an OLD, pre-invalidation token
    // whose `iat` fell in the SAME second as the (truncated-down)
    // invalidation instant was then incorrectly ACCEPTED. Comparing the
    // untruncated instant directly against `iat`'s floored second (as
    // below) is the fail-CLOSED choice for that same one-second
    // ambiguity window: it can reject a legitimate brand-new session
    // established within the exact same wall-clock second as a Force
    // Sign-Out (a rare, self-resolving-on-retry inconvenience — the next
    // request a fraction of a second later succeeds normally), but it can
    // never accept a token that actually predates the invalidation. This
    // is the intended trade-off, not an oversight.
    const rows = await db
      .select({ id: staff.id, role: staff.role, hostelId: staff.hostelId })
      .from(staff)
      .where(
        and(
          eq(staff.authUserId, authUserId),
          eq(staff.status, "active"),
          or(
            isNull(staff.sessionsInvalidatedBefore),
            lte(staff.sessionsInvalidatedBefore, new Date(tokenIssuedAtSeconds * 1000)),
          ),
        ),
      )
      .limit(1);
    return rows[0]
      ? { id: rows[0].id, role: rows[0].role as StaffRole, hostelId: rows[0].hostelId }
      : null;
  }

  async isParentLinkedToStudent(parentId: string, studentId: string) {
    const rows = await db
      .select({ id: parentStudentRelationships.id })
      .from(parentStudentRelationships)
      .where(
        and(
          eq(parentStudentRelationships.parentId, parentId),
          eq(parentStudentRelationships.studentId, studentId),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async hasActiveTrustedDevice(parentId: string) {
    const rows = await db
      .select({ id: trustedDevices.id })
      .from(trustedDevices)
      .where(and(eq(trustedDevices.parentId, parentId), isNull(trustedDevices.revokedAt)))
      .limit(1);
    return rows.length > 0;
  }
}
