import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, db, hostels, students, parents, parentStudentRelationships } from "@digihostel/db";
import { DrizzleEligibilityRepository } from "./eligibilityRepository.js";

/**
 * Real-Postgres integration test — proves the eligibility gate's actual SQL
 * (join + relationship-type filter + deterministic tie-break) against a real
 * schema, not just the fake repository's in-memory Map (service.test.ts).
 * Same convention as domain/leave/repository.integration.test.ts: skipped
 * automatically when DATABASE_URL isn't set, fixed synthetic UUIDs, cleans up
 * everything it inserts.
 */
const RUN = Boolean(process.env.DATABASE_URL);

describe.skipIf(!RUN)("DrizzleEligibilityRepository (real Postgres integration)", () => {
  const HOSTEL_ID = "f0200000-0000-0000-0000-000000000001";
  const STUDENT_ID = "f0200000-0000-0000-0000-000000000002";
  const FATHER_ID = "f0200000-0000-0000-0000-000000000003";
  const MOTHER_ID = "f0200000-0000-0000-0000-000000000004";
  // A student with two "father" relationship rows — the schema has no
  // uniqueness constraint on (student_id, relationship_type), only on
  // (parent_id, student_id) — an already-acknowledged data-model ambiguity
  // (ADR-016). Proves the repository's orderBy(asc(createdAt)) tie-break
  // deterministically, against real Postgres row ordering, not an assumption
  // about Map iteration order.
  const DUP_STUDENT_ID = "f0200000-0000-0000-0000-000000000005";
  const DUP_FATHER_EARLIER_ID = "f0200000-0000-0000-0000-000000000006";
  const DUP_FATHER_LATER_ID = "f0200000-0000-0000-0000-000000000007";

  const repository = new DrizzleEligibilityRepository();

  beforeAll(async () => {
    await db.insert(hostels).values({ id: HOSTEL_ID, name: "F-02 Integration Test Hostel" });
    await db.insert(students).values([
      {
        id: STUDENT_ID,
        rollNumber: "F02-INTEGRATION-001",
        fullName: "F-02 Integration Student",
        hostelId: HOSTEL_ID,
      },
      {
        id: DUP_STUDENT_ID,
        rollNumber: "F02-INTEGRATION-002",
        fullName: "F-02 Integration Duplicate-Relationship Student",
        hostelId: HOSTEL_ID,
      },
    ]);
    await db.insert(parents).values([
      { id: FATHER_ID, fullName: "F-02 Integration Father", phoneNumber: "+91-9000000091" },
      { id: MOTHER_ID, fullName: "F-02 Integration Mother", phoneNumber: "+91-9000000092" },
      {
        id: DUP_FATHER_EARLIER_ID,
        fullName: "F-02 Integration Earlier Father",
        phoneNumber: "+91-9000000093",
      },
      {
        id: DUP_FATHER_LATER_ID,
        fullName: "F-02 Integration Later Father",
        phoneNumber: "+91-9000000094",
      },
    ]);
    await db.insert(parentStudentRelationships).values([
      {
        parentId: FATHER_ID,
        studentId: STUDENT_ID,
        relationshipType: "father",
        escalationOrder: 1,
      },
      {
        parentId: MOTHER_ID,
        studentId: STUDENT_ID,
        relationshipType: "mother",
        escalationOrder: 2,
      },
    ]);
    // Inserted sequentially so createdAt ordering is deterministic (Postgres
    // default_now() has real, if small, monotonic separation across two
    // separate insert statements).
    await db.insert(parentStudentRelationships).values({
      parentId: DUP_FATHER_EARLIER_ID,
      studentId: DUP_STUDENT_ID,
      relationshipType: "father",
      escalationOrder: 1,
    });
    await db.insert(parentStudentRelationships).values({
      parentId: DUP_FATHER_LATER_ID,
      studentId: DUP_STUDENT_ID,
      relationshipType: "father",
      escalationOrder: 2,
    });
  });

  afterAll(async () => {
    await db
      .delete(parentStudentRelationships)
      .where(eq(parentStudentRelationships.studentId, STUDENT_ID));
    await db
      .delete(parentStudentRelationships)
      .where(eq(parentStudentRelationships.studentId, DUP_STUDENT_ID));
    await db.delete(parents).where(eq(parents.id, FATHER_ID));
    await db.delete(parents).where(eq(parents.id, MOTHER_ID));
    await db.delete(parents).where(eq(parents.id, DUP_FATHER_EARLIER_ID));
    await db.delete(parents).where(eq(parents.id, DUP_FATHER_LATER_ID));
    await db.delete(students).where(eq(students.id, STUDENT_ID));
    await db.delete(students).where(eq(students.id, DUP_STUDENT_ID));
    await db.delete(hostels).where(eq(hostels.id, HOSTEL_ID));
  });

  it("resolves the authoritative phone for a real roll number + matching relationship", async () => {
    const phone = await repository.findEligiblePhone("F02-INTEGRATION-001", "father");
    expect(phone).toBe("+91-9000000091");
  });

  it("resolves the mother's phone independently of the father's", async () => {
    const phone = await repository.findEligiblePhone("F02-INTEGRATION-001", "mother");
    expect(phone).toBe("+91-9000000092");
  });

  it("returns null for a real roll number with no matching relationship type (guardian never registered)", async () => {
    const phone = await repository.findEligiblePhone("F02-INTEGRATION-001", "guardian");
    expect(phone).toBeNull();
  });

  it("returns null for a roll number that doesn't exist at all", async () => {
    const phone = await repository.findEligiblePhone("NO-SUCH-ROLL-NUMBER", "father");
    expect(phone).toBeNull();
  });

  it("deterministically picks the earliest-created relationship when duplicates exist for the same (student, relationship_type)", async () => {
    const phone = await repository.findEligiblePhone("F02-INTEGRATION-002", "father");
    expect(phone).toBe("+91-9000000093"); // DUP_FATHER_EARLIER_ID, inserted first
  });
});
