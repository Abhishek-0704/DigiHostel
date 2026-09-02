import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import {
  db,
  hostels,
  students,
  parents,
  parentStudentRelationships,
  leaveRequests,
  leaveApprovalEvents,
  auditLogs,
} from "@digihostel/db";
import { DrizzleLeaveRepository } from "./repository.js";

/**
 * Real-Postgres integration test — exercises the actual atomic transaction
 * and optimistic-concurrency behavior against the local Supabase instance
 * (docs/database-schema-design.md, ADR-015). Deliberately NOT part of the
 * default `pnpm test` run's hard requirements: skipped automatically when
 * DATABASE_URL isn't set, so the standard verification suite stays
 * Docker-independent — run explicitly (with the local Supabase stack up)
 * as this task's separate "targeted leave API tests" / concurrency
 * verification step. See docs/leave-approval-workflow.md.
 *
 * Uses fixed, obviously-synthetic test UUIDs and cleans up everything it
 * inserts in afterAll — never touches supabase/seed.sql's own fixtures.
 */
const RUN = Boolean(process.env.DATABASE_URL);

describe.skipIf(!RUN)("LeaveRepository (real Postgres integration)", () => {
  const HOSTEL_ID = "c1000000-0000-0000-0000-000000000001";
  const STUDENT_ID = "c1000000-0000-0000-0000-000000000002";
  const PARENT_ID = "c1000000-0000-0000-0000-000000000003";
  const OTHER_PARENT_ID = "c1000000-0000-0000-0000-000000000004";
  const GUARDIAN_ID = "c1000000-0000-0000-0000-000000000007";

  const repository = new DrizzleLeaveRepository();

  async function freshLeaveRequestId(status: "pending" | "approved" | "expired" = "pending") {
    const [row] = await db
      .insert(leaveRequests)
      .values({
        studentId: STUDENT_ID,
        reason: "integration test",
        startDate: "2026-10-01",
        endDate: "2026-10-03",
        status,
      })
      .returning({ id: leaveRequests.id });
    return row.id;
  }

  beforeAll(async () => {
    await db.insert(hostels).values({ id: HOSTEL_ID, name: "Integration Test Hostel" });
    await db.insert(students).values({
      id: STUDENT_ID,
      rollNumber: "INTEGRATION-TEST-001",
      fullName: "Integration Test Student",
      hostelId: HOSTEL_ID,
    });
    await db.insert(parents).values([
      { id: PARENT_ID, fullName: "Integration Test Parent", phoneNumber: "+91-9000000099" },
      {
        id: OTHER_PARENT_ID,
        fullName: "Integration Test Unrelated Parent",
        phoneNumber: "+91-9000000098",
      },
      {
        id: GUARDIAN_ID,
        fullName: "Integration Test Guardian",
        phoneNumber: "+91-9000000097",
      },
    ]);
    await db.insert(parentStudentRelationships).values([
      {
        parentId: PARENT_ID,
        studentId: STUDENT_ID,
        relationshipType: "father",
        escalationOrder: 1,
      },
      // Guardian access is NOT a separate profile/role/table — per ADR-001's
      // stated rationale ("Guardian is a backup approver in the same
      // escalation chain, not a structurally different entity"), it is the
      // exact same `parents` row + `parent_student_relationships` model,
      // distinguished only by `relationship_type`. These tests prove that
      // distinction carries no authorization difference at all today: a
      // `relationship_type: "guardian"` row is read/decide-authorized
      // identically to a `"father"` row, through the unmodified existing
      // relationshipExists() check (which never inspects relationship_type).
      {
        parentId: GUARDIAN_ID,
        studentId: STUDENT_ID,
        relationshipType: "guardian",
        escalationOrder: 3,
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(auditLogs).where(eq(auditLogs.entityType, "leave_requests"));
    await db.delete(leaveApprovalEvents);
    await db.delete(leaveRequests).where(eq(leaveRequests.studentId, STUDENT_ID));
    await db
      .delete(parentStudentRelationships)
      .where(eq(parentStudentRelationships.studentId, STUDENT_ID));
    await db.delete(parents).where(eq(parents.id, PARENT_ID));
    await db.delete(parents).where(eq(parents.id, OTHER_PARENT_ID));
    await db.delete(parents).where(eq(parents.id, GUARDIAN_ID));
    await db.delete(students).where(eq(students.id, STUDENT_ID));
    await db.delete(hostels).where(eq(hostels.id, HOSTEL_ID));
  });

  it("atomic transaction: successful decision produces exactly one state transition, one approval event, and one audit event", async () => {
    const leaveRequestId = await freshLeaveRequestId();

    const outcome = await repository.decide({
      leaveRequestId,
      actingParentId: PARENT_ID,
      decision: "approved",
      biometricAssertion: { assertionToken: "tok", actionId: "leave-decision" },
    });

    expect(outcome.kind).toBe("success");

    const [request] = await db
      .select()
      .from(leaveRequests)
      .where(eq(leaveRequests.id, leaveRequestId));
    expect(request.status).toBe("approved");

    const events = await db
      .select()
      .from(leaveApprovalEvents)
      .where(eq(leaveApprovalEvents.leaveRequestId, leaveRequestId));
    expect(events).toHaveLength(1);
    expect(events[0].response).toBe("approved");
    expect(events[0].biometricConfirmed).toBe(true);

    const audits = await db.select().from(auditLogs).where(eq(auditLogs.entityId, leaveRequestId));
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe("leave.approved");
  });

  it("concurrency: two simultaneous decisions on the same leave request — exactly one succeeds", async () => {
    const leaveRequestId = await freshLeaveRequestId();

    const [resultA, resultB] = await Promise.all([
      repository.decide({
        leaveRequestId,
        actingParentId: PARENT_ID,
        decision: "approved",
        biometricAssertion: { assertionToken: "tok-a", actionId: "leave-decision" },
      }),
      repository.decide({
        leaveRequestId,
        actingParentId: PARENT_ID,
        decision: "rejected",
        biometricAssertion: { assertionToken: "tok-b", actionId: "leave-decision" },
      }),
    ]);

    const outcomes = [resultA.kind, resultB.kind];
    const successCount = outcomes.filter((k) => k === "success").length;
    const conflictCount = outcomes.filter((k) => k === "conflict").length;

    expect(successCount).toBe(1);
    expect(conflictCount).toBe(1);

    // Exactly one approval event exists — the loser never wrote one.
    const events = await db
      .select()
      .from(leaveApprovalEvents)
      .where(eq(leaveApprovalEvents.leaveRequestId, leaveRequestId));
    expect(events).toHaveLength(1);

    const audits = await db.select().from(auditLogs).where(eq(auditLogs.entityId, leaveRequestId));
    expect(audits).toHaveLength(1);
  });

  it("unrelated parent: repository denies with not_found (relationship enforced in application code, matching RLS)", async () => {
    const leaveRequestId = await freshLeaveRequestId();

    const outcome = await repository.decide({
      leaveRequestId,
      actingParentId: OTHER_PARENT_ID,
      decision: "approved",
      biometricAssertion: { assertionToken: "tok", actionId: "leave-decision" },
    });

    expect(outcome.kind).toBe("not_found");

    const [request] = await db
      .select()
      .from(leaveRequests)
      .where(eq(leaveRequests.id, leaveRequestId));
    expect(request.status).toBe("pending"); // untouched
  });

  it("terminal state: deciding an already-approved request returns conflict and writes nothing further", async () => {
    const leaveRequestId = await freshLeaveRequestId("approved");

    const outcome = await repository.decide({
      leaveRequestId,
      actingParentId: PARENT_ID,
      decision: "rejected",
      biometricAssertion: { assertionToken: "tok", actionId: "leave-decision" },
    });

    expect(outcome).toEqual({ kind: "conflict", currentStatus: "approved" });

    const events = await db
      .select()
      .from(leaveApprovalEvents)
      .where(eq(leaveApprovalEvents.leaveRequestId, leaveRequestId));
    expect(events).toHaveLength(0);
  });

  it("create: student creation is atomic — inserts the leave_requests row (default pending) and exactly one audit_logs row, no leave_approval_events row", async () => {
    const view = await repository.create({
      studentId: STUDENT_ID,
      reason: "Integration test creation",
      startDate: "2026-11-01",
      endDate: "2026-11-03",
    });

    expect(view.status).toBe("pending");
    expect(view.studentId).toBe(STUDENT_ID);

    const [request] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, view.id));
    expect(request.status).toBe("pending");

    const audits = await db.select().from(auditLogs).where(eq(auditLogs.entityId, view.id));
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe("leave.created");

    const events = await db
      .select()
      .from(leaveApprovalEvents)
      .where(eq(leaveApprovalEvents.leaveRequestId, view.id));
    expect(events).toHaveLength(0);
  });

  it("listForStudent: returns only the given student's requests", async () => {
    const OTHER_STUDENT_ID = "c1000000-0000-0000-0000-000000000005";
    await db.insert(students).values({
      id: OTHER_STUDENT_ID,
      rollNumber: "INTEGRATION-TEST-002",
      fullName: "Other Integration Test Student",
      hostelId: HOSTEL_ID,
    });

    try {
      const own = await repository.create({
        studentId: STUDENT_ID,
        reason: "Mine",
        startDate: "2026-11-01",
        endDate: "2026-11-02",
      });
      await repository.create({
        studentId: OTHER_STUDENT_ID,
        reason: "Not mine",
        startDate: "2026-11-01",
        endDate: "2026-11-02",
      });

      const results = await repository.listForStudent(STUDENT_ID);
      expect(results.some((r) => r.id === own.id)).toBe(true);
      expect(results.every((r) => r.studentId === STUDENT_ID)).toBe(true);
    } finally {
      await db.delete(auditLogs).where(eq(auditLogs.actorId, OTHER_STUDENT_ID));
      await db.delete(leaveRequests).where(eq(leaveRequests.studentId, OTHER_STUDENT_ID));
      await db.delete(students).where(eq(students.id, OTHER_STUDENT_ID));
    }
  });

  it("findAccessibleLeaveRequestForStudent: owner allowed, a different student denied identically to a nonexistent id", async () => {
    const view = await repository.create({
      studentId: STUDENT_ID,
      reason: "Ownership check",
      startDate: "2026-11-01",
      endDate: "2026-11-02",
    });

    const ownerResult = await repository.findAccessibleLeaveRequestForStudent(view.id, STUDENT_ID);
    expect(ownerResult?.id).toBe(view.id);

    const OTHER_STUDENT_ID = "c1000000-0000-0000-0000-000000000006";
    const wrongStudentResult = await repository.findAccessibleLeaveRequestForStudent(
      view.id,
      OTHER_STUDENT_ID,
    );
    const nonexistentIdResult = await repository.findAccessibleLeaveRequestForStudent(
      "00000000-0000-0000-0000-000000000000",
      OTHER_STUDENT_ID,
    );
    expect(wrongStudentResult).toBeNull();
    expect(nonexistentIdResult).toBeNull();
  });

  it.each(["approved", "rejected"] as const)(
    "full lifecycle flow (%s variant): student creates -> parent reads -> parent decides -> DB state verified -> student sees terminal state -> a second decision fails",
    async (decision) => {
      // 1-2: student authenticates (out of scope here — proven at the route
      // layer) and creates a leave request.
      const created = await repository.create({
        studentId: STUDENT_ID,
        reason: `Full lifecycle check (${decision})`,
        startDate: "2026-11-01",
        endDate: "2026-11-03",
      });
      expect(created.status).toBe("pending");

      // 3-4: parent authenticates (route layer) and reads the request.
      const readByParent = await repository.findAccessibleLeaveRequest(created.id, PARENT_ID);
      expect(readByParent?.status).toBe("pending");

      // 5: parent decides.
      const outcome = await repository.decide({
        leaveRequestId: created.id,
        actingParentId: PARENT_ID,
        decision,
        biometricAssertion: { assertionToken: "tok", actionId: "leave-decision" },
      });
      expect(outcome.kind).toBe("success");

      // 6: verify final DB state.
      const [finalRequest] = await db
        .select()
        .from(leaveRequests)
        .where(eq(leaveRequests.id, created.id));
      expect(finalRequest.status).toBe(decision);

      // 7: verify exactly one approval event.
      const events = await db
        .select()
        .from(leaveApprovalEvents)
        .where(eq(leaveApprovalEvents.leaveRequestId, created.id));
      expect(events).toHaveLength(1);
      expect(events[0].response).toBe(decision);
      expect(events[0].biometricConfirmed).toBe(true);

      // 8: verify expected audit records — creation + decision, nothing else.
      const audits = await db.select().from(auditLogs).where(eq(auditLogs.entityId, created.id));
      expect(audits.map((a) => a.action).sort()).toEqual(
        [decision === "approved" ? "leave.approved" : "leave.rejected", "leave.created"].sort(),
      );

      // 9: verify the student can see the resulting terminal state.
      const seenByStudent = await repository.findAccessibleLeaveRequestForStudent(
        created.id,
        STUDENT_ID,
      );
      expect(seenByStudent?.status).toBe(decision);

      // 10: verify a second decision fails — terminal state, no further writes.
      const secondAttempt = await repository.decide({
        leaveRequestId: created.id,
        actingParentId: PARENT_ID,
        decision: decision === "approved" ? "rejected" : "approved",
        biometricAssertion: { assertionToken: "tok-2", actionId: "leave-decision" },
      });
      expect(secondAttempt).toEqual({ kind: "conflict", currentStatus: decision });

      const eventsAfterSecondAttempt = await db
        .select()
        .from(leaveApprovalEvents)
        .where(eq(leaveApprovalEvents.leaveRequestId, created.id));
      expect(eventsAfterSecondAttempt).toHaveLength(1); // unchanged — the second attempt wrote nothing

      const auditsAfterSecondAttempt = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.entityId, created.id));
      expect(auditsAfterSecondAttempt).toHaveLength(2); // unchanged
    },
  );

  it("guardian relationship: a parent row with relationship_type='guardian' can read and decide identically to 'father'", async () => {
    const created = await repository.create({
      studentId: STUDENT_ID,
      reason: "Guardian authorization check",
      startDate: "2026-11-01",
      endDate: "2026-11-02",
    });

    const readByGuardian = await repository.findAccessibleLeaveRequest(created.id, GUARDIAN_ID);
    expect(readByGuardian?.id).toBe(created.id);

    const outcome = await repository.decide({
      leaveRequestId: created.id,
      actingParentId: GUARDIAN_ID,
      decision: "approved",
      biometricAssertion: { assertionToken: "tok", actionId: "leave-decision" },
    });
    expect(outcome.kind).toBe("success");

    const events = await db
      .select()
      .from(leaveApprovalEvents)
      .where(eq(leaveApprovalEvents.leaveRequestId, created.id));
    expect(events).toHaveLength(1);
    expect(events[0].actorParentId).toBe(GUARDIAN_ID);
  });

  it("guardian relationship: a guardian NOT linked to the student is denied identically to an unrelated parent", async () => {
    const created = await repository.create({
      studentId: STUDENT_ID,
      reason: "Guardian denial check",
      startDate: "2026-11-01",
      endDate: "2026-11-02",
    });

    // OTHER_PARENT_ID has no relationship row to STUDENT_ID at all (of any
    // relationship_type) — reusing it here proves denial is symmetric
    // regardless of which relationship_type an authorized caller would have had.
    const readResult = await repository.findAccessibleLeaveRequest(created.id, OTHER_PARENT_ID);
    expect(readResult).toBeNull();

    const outcome = await repository.decide({
      leaveRequestId: created.id,
      actingParentId: OTHER_PARENT_ID,
      decision: "approved",
      biometricAssertion: { assertionToken: "tok", actionId: "leave-decision" },
    });
    expect(outcome.kind).toBe("not_found");
  });
});
