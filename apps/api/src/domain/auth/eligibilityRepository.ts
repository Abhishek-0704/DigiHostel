import { and, asc, eq, db, students, parents, parentStudentRelationships } from "@digihostel/db";
import type { ParentRelationshipType } from "./types.js";

/**
 * F-02 remediation — the authoritative roll-number → parent-record lookup
 * ADR-020 requires. Deliberately narrow (one method), mirroring
 * `lib/auth/db-port.ts`'s "narrow port over the exact queries this boundary
 * needs" convention, not a generic query escape hatch.
 *
 * Runs on Fastify's own privileged Postgres connection (same as every other
 * repository in `apps/api` — see `domain/leave/repository.ts`'s doc comment
 * on why this bypasses RLS by design and is not a gap: RLS still
 * independently protects any *direct* Supabase client access path, per
 * ADR-014's defense-in-depth model). This is intentionally the ONLY place
 * in the backend that ever reads `parents.phone_number` for the purpose of
 * dispatching an OTP — the value is used internally by
 * `AuthOtpService.requestOtp` and is never returned to any HTTP caller.
 */
export interface EligibilityRepository {
  /**
   * Resolves `(rollNumber, relationshipType)` to the linked parent's
   * authoritative phone number, or `null` if any part of the chain doesn't
   * hold: the roll number doesn't match a real student, no
   * `parent_student_relationships` row of that exact relationship type
   * links to that student, or (structurally impossible given the schema's
   * own NOT NULL/foreign-key constraints, but never assumed) the resulting
   * parent record is missing.
   *
   * Deliberately does NOT distinguish *why* it returned null — mirroring
   * `LeaveRepository.findAccessibleLeaveRequest`'s own anti-enumeration
   * design (one query shape, one negative outcome) — a caller must not be
   * able to infer "wrong roll number" vs. "right roll number, wrong
   * relationship" vs. "right roll number and relationship, parent record
   * missing" from timing or response shape.
   *
   * If more than one parent record happens to share the same
   * `relationship_type` for the same student (the schema has no uniqueness
   * constraint on that pair — an already-acknowledged, pre-existing
   * data-model ambiguity, see ADR-016's own discussion of this exact case),
   * this deterministically picks the earliest-created relationship row
   * rather than an arbitrary one.
   */
  findEligiblePhone(
    rollNumber: string,
    relationshipType: ParentRelationshipType,
  ): Promise<string | null>;
}

export class DrizzleEligibilityRepository implements EligibilityRepository {
  async findEligiblePhone(
    rollNumber: string,
    relationshipType: ParentRelationshipType,
  ): Promise<string | null> {
    const rows = await db
      .select({ phoneNumber: parents.phoneNumber })
      .from(students)
      .innerJoin(parentStudentRelationships, eq(parentStudentRelationships.studentId, students.id))
      .innerJoin(parents, eq(parents.id, parentStudentRelationships.parentId))
      .where(
        and(
          eq(students.rollNumber, rollNumber),
          eq(parentStudentRelationships.relationshipType, relationshipType),
        ),
      )
      .orderBy(asc(parentStudentRelationships.createdAt))
      .limit(1);

    return rows[0]?.phoneNumber ?? null;
  }
}
