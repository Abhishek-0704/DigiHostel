import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  eq,
  inArray,
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
import { NoopJobScheduler } from "../../lib/queue/jobs.js";
import type { LeaveRequestStatus } from "./types.js";

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

  // NoopJobScheduler: this file verifies leave-decision/conditional-update
  // semantics, not queue behavior — no live pg-boss connection needed.
  const repository = new DrizzleLeaveRepository(new NoopJobScheduler());

  async function freshLeaveRequestId(status: LeaveRequestStatus = "pending") {
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
    // Scoped to THIS test file's own leave requests only — the previous
    // unscoped `delete(auditLogs).where(entityType = 'leave_requests')` and
    // fully-unscoped `delete(leaveApprovalEvents)` (no .where() at all) were
    // a pre-existing bug: they wiped every leave_requests-typed audit_logs
    // row and EVERY leave_approval_events row workspace-wide, including
    // supabase/seed.sql's own fixture rows, whenever this file ran against
    // a real database — silently corrupting shared local dev/seed state for
    // any other verification (e.g. `supabase test db`) run afterward.
    const ownLeaveRequestIds = (
      await db
        .select({ id: leaveRequests.id })
        .from(leaveRequests)
        .where(eq(leaveRequests.studentId, STUDENT_ID))
    ).map((r) => r.id);
    if (ownLeaveRequestIds.length > 0) {
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, ownLeaveRequestIds));
      await db
        .delete(leaveApprovalEvents)
        .where(inArray(leaveApprovalEvents.leaveRequestId, ownLeaveRequestIds));
    }
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

  describe("listEventsForLeaveRequest (Approval History, Phase 4 Prompt 10)", () => {
    it("returns real leave_approval_events rows, oldest first, mapped without actor identity", async () => {
      const leaveRequestId = await freshLeaveRequestId();

      // Two real transitions against the real DB, exercising the actual
      // insert path (decide() itself), not a fabricated row.
      const decided = await repository.decide({
        leaveRequestId,
        actingParentId: PARENT_ID,
        decision: "approved",
        biometricAssertion: { assertionToken: "tok", actionId: "leave-decision" },
      });
      expect(decided.kind).toBe("success");

      const events = await repository.listEventsForLeaveRequest(leaveRequestId);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ eventType: "responded", response: "approved" });
      expect(events[0]).not.toHaveProperty("actorParentId");
      expect(events[0]).not.toHaveProperty("actorStaffId");
    });

    it("returns an empty array for a request with no events yet", async () => {
      const leaveRequestId = await freshLeaveRequestId();
      const events = await repository.listEventsForLeaveRequest(leaveRequestId);
      expect(events).toEqual([]);
    });
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

  it("listForParent: returns only requests belonging to a student the parent is linked to, never a client-supplied filter (G-05)", async () => {
    const OTHER_STUDENT_ID = "c1000000-0000-0000-0000-000000000006";
    await db.insert(students).values({
      id: OTHER_STUDENT_ID,
      rollNumber: "INTEGRATION-TEST-003",
      fullName: "Unlinked Integration Test Student",
      hostelId: HOSTEL_ID,
    });

    try {
      const linkedRequest = await repository.create({
        studentId: STUDENT_ID,
        reason: "Linked student's request",
        startDate: "2026-11-01",
        endDate: "2026-11-02",
      });
      await repository.create({
        studentId: OTHER_STUDENT_ID,
        reason: "Unlinked student's request",
        startDate: "2026-11-01",
        endDate: "2026-11-02",
      });

      // PARENT_ID is linked (father) to STUDENT_ID only — see beforeAll.
      const results = await repository.listForParent(PARENT_ID);
      expect(results.some((r) => r.id === linkedRequest.id)).toBe(true);
      expect(results.every((r) => r.studentId === STUDENT_ID)).toBe(true);

      // GUARDIAN_ID is linked (guardian relationship_type) to the SAME
      // STUDENT_ID — ADR-016 Model C: identical access, no relationship_type
      // distinction.
      const guardianResults = await repository.listForParent(GUARDIAN_ID);
      expect(guardianResults.some((r) => r.id === linkedRequest.id)).toBe(true);

      // OTHER_PARENT_ID has no relationship to any student — empty, not an
      // error.
      const unrelatedResults = await repository.listForParent(OTHER_PARENT_ID);
      expect(unrelatedResults.some((r) => r.id === linkedRequest.id)).toBe(false);
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

  describe("advanceEscalation (ADR-017 §4/§9, corrected by ADR-019)", () => {
    it("advances one stage, writes exactly one escalated event, and returns the next stage", async () => {
      const leaveRequestId = await freshLeaveRequestId("father_notified");

      const outcome = await repository.advanceEscalation(leaveRequestId, "father_notified");

      expect(outcome.kind).toBe("advanced");
      if (outcome.kind !== "advanced") throw new Error("unreachable");
      expect(outcome.nextStage).toBe("mother_notified");
      expect(outcome.leaveRequest.status).toBe("mother_notified");

      const events = await db
        .select()
        .from(leaveApprovalEvents)
        .where(eq(leaveApprovalEvents.leaveRequestId, leaveRequestId));
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe("escalated");

      const audits = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.entityId, leaveRequestId));
      expect(audits).toHaveLength(1);
      expect(audits[0].action).toBe("leave.escalated");
    });

    it("advances guardian_notified to in_app_call, not directly to manual_verification (ADR-019 §1)", async () => {
      const leaveRequestId = await freshLeaveRequestId("guardian_notified");

      const outcome = await repository.advanceEscalation(leaveRequestId, "guardian_notified");

      expect(outcome.kind).toBe("advanced");
      if (outcome.kind !== "advanced") throw new Error("unreachable");
      expect(outcome.nextStage).toBe("in_app_call");
    });

    it("stale job (status no longer matches expectedStage): clean no-op, no writes", async () => {
      const leaveRequestId = await freshLeaveRequestId("father_notified");

      // Simulate the request having already been decided by the time this
      // (now-stale) job runs.
      await db
        .update(leaveRequests)
        .set({ status: "approved" })
        .where(eq(leaveRequests.id, leaveRequestId));

      const outcome = await repository.advanceEscalation(leaveRequestId, "father_notified");

      expect(outcome.kind).toBe("noop");

      const events = await db
        .select()
        .from(leaveApprovalEvents)
        .where(eq(leaveApprovalEvents.leaveRequestId, leaveRequestId));
      expect(events).toHaveLength(0);

      const [request] = await db
        .select()
        .from(leaveRequests)
        .where(eq(leaveRequests.id, leaveRequestId));
      expect(request.status).toBe("approved"); // unchanged
    });

    it("manual_verification has no automatic successor: defensive no-op if ever called", async () => {
      const leaveRequestId = await freshLeaveRequestId("father_notified");
      await db
        .update(leaveRequests)
        .set({ status: "manual_verification" })
        .where(eq(leaveRequests.id, leaveRequestId));

      const outcome = await repository.advanceEscalation(leaveRequestId, "manual_verification");
      expect(outcome.kind).toBe("noop");
    });

    it("two concurrent evaluate jobs for the same stage: exactly one advances", async () => {
      const leaveRequestId = await freshLeaveRequestId("mother_notified");

      const [a, b] = await Promise.all([
        repository.advanceEscalation(leaveRequestId, "mother_notified"),
        repository.advanceEscalation(leaveRequestId, "mother_notified"),
      ]);

      const outcomes = [a.kind, b.kind];
      expect(outcomes.filter((k) => k === "advanced")).toHaveLength(1);
      expect(outcomes.filter((k) => k === "noop")).toHaveLength(1);

      const events = await db
        .select()
        .from(leaveApprovalEvents)
        .where(eq(leaveApprovalEvents.leaveRequestId, leaveRequestId));
      expect(events).toHaveLength(1);
    });
  });

  describe("markExpired (ADR-019 §2 — staff-only, from manual_verification only)", () => {
    it("super_admin: manual_verification -> expired succeeds", async () => {
      const leaveRequestId = await freshLeaveRequestId("father_notified");
      await db
        .update(leaveRequests)
        .set({ status: "manual_verification" })
        .where(eq(leaveRequests.id, leaveRequestId));

      const outcome = await repository.markExpired({
        leaveRequestId,
        actingStaffId: "22220000-0000-0000-0000-000000000001", // no staff row needed — super_admin is unscoped
        actingStaffRole: "super_admin",
      });

      expect(outcome.kind).toBe("success");
      if (outcome.kind !== "success") throw new Error("unreachable");
      expect(outcome.leaveRequest.status).toBe("expired");

      const events = await db
        .select()
        .from(leaveApprovalEvents)
        .where(eq(leaveApprovalEvents.leaveRequestId, leaveRequestId));
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe("expired");
    });

    it("wrong status (not manual_verification): 409 conflict, not silently accepted", async () => {
      const leaveRequestId = await freshLeaveRequestId("father_notified");

      const outcome = await repository.markExpired({
        leaveRequestId,
        actingStaffId: "22220000-0000-0000-0000-000000000001",
        actingStaffRole: "super_admin",
      });

      expect(outcome.kind).toBe("conflict");
      if (outcome.kind !== "conflict") throw new Error("unreachable");
      expect(outcome.currentStatus).toBe("father_notified");
    });

    it("nonexistent leave request: not_found, same as decide()'s anti-enumeration shape", async () => {
      const outcome = await repository.markExpired({
        leaveRequestId: "99999999-9999-9999-9999-999999999999",
        actingStaffId: "22220000-0000-0000-0000-000000000001",
        actingStaffRole: "super_admin",
      });
      expect(outcome.kind).toBe("not_found");
    });
  });
});
