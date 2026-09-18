import { describe, it, expect } from "vitest";
import { DrizzleHealthRepository } from "./repository.js";

/**
 * Real-Postgres integration test — exercises the actual atomic transaction,
 * conditional-UPDATE-WHERE-status transition guard, and genuine concurrency
 * behavior against the local Supabase instance's real seed data, mirroring
 * `domain/emergency/repository.integration.test.ts`'s own `RUN`-gated
 * convention.
 */
const RUN = Boolean(process.env.DATABASE_URL);

describe.skipIf(!RUN)("DrizzleHealthRepository (real Postgres integration)", () => {
  const RECEPTION1_STAFF_ID = "e0000000-0000-0000-0000-000000000001"; // Kalinga
  const RECEPTION2_STAFF_ID = "e0000000-0000-0000-0000-000000000006"; // Utkal
  const SUPER_ADMIN_STAFF_ID = "e0000000-0000-0000-0000-000000000004";

  it("create: reception1 (Kalinga) reports a case for the seeded Kalinga student", async () => {
    const repo = new DrizzleHealthRepository();
    const outcome = await repo.create({
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      rollNumber: "TEST-S001",
      category: "medical_observation",
      severity: "high",
      description: "Integration test: fever, sent to infirmary",
    });
    expect(outcome.kind).toBe("success");
    if (outcome.kind === "success") {
      expect(outcome.healthCase.status).toBe("new");
      expect(outcome.healthCase.category).toBe("medical_observation");
      expect(outcome.healthCase.admittedAt).toBeNull();
      expect(outcome.healthCase.timeline.map((e) => e.eventType)).toEqual(["created"]);
    }
  });

  it("create: an admission-type category sets admittedAt automatically", async () => {
    const repo = new DrizzleHealthRepository();
    const outcome = await repo.create({
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      rollNumber: "TEST-S001",
      category: "hospital_admission",
      severity: "critical",
      description: "Integration test: admitted for observation",
    });
    expect(outcome.kind).toBe("success");
    if (outcome.kind === "success") {
      expect(outcome.healthCase.admittedAt).not.toBeNull();
    }
  });

  it("create: reception2 (Utkal) cannot report a case for the Kalinga student (anti-enumeration)", async () => {
    const repo = new DrizzleHealthRepository();
    const outcome = await repo.create({
      staffId: RECEPTION2_STAFF_ID,
      staffRole: "reception_warden",
      rollNumber: "TEST-S001",
      category: "medical_observation",
      severity: "high",
      description: "Should not be created",
    });
    expect(outcome.kind).toBe("student_not_found");
  });

  it("full legitimate lifecycle: new -> acknowledged -> monitoring -> awaiting_update -> monitoring -> resolved -> closed", async () => {
    const repo = new DrizzleHealthRepository();
    const created = await repo.create({
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      rollNumber: "TEST-S001",
      category: "medical_observation",
      severity: "medium",
      description: "Integration test: lifecycle",
    });
    expect(created.kind).toBe("success");
    if (created.kind !== "success") return;
    const caseId = created.healthCase.id;

    const acked = await repo.transition("acknowledge", {
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      caseId,
    });
    expect(acked.kind).toBe("success");
    if (acked.kind === "success") {
      expect(acked.healthCase.status).toBe("acknowledged");
      expect(acked.healthCase.assignedStaffId).toBe(RECEPTION1_STAFF_ID);
    }

    const monitoring = await repo.transition("startMonitoring", {
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      caseId,
    });
    expect(monitoring.kind).toBe("success");

    const noted = await repo.addNote({
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      caseId,
      note: "Parent informed by phone.",
    });
    expect(noted.kind).toBe("success");

    const awaiting = await repo.transition("markAwaitingUpdate", {
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      caseId,
    });
    expect(awaiting.kind).toBe("success");
    if (awaiting.kind === "success") expect(awaiting.healthCase.status).toBe("awaiting_update");

    const resumed = await repo.transition("resumeMonitoring", {
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      caseId,
    });
    expect(resumed.kind).toBe("success");
    if (resumed.kind === "success") expect(resumed.healthCase.status).toBe("monitoring");

    const resolved = await repo.transition("resolve", {
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      caseId,
    });
    expect(resolved.kind).toBe("success");
    if (resolved.kind === "success") {
      expect(resolved.healthCase.status).toBe("resolved");
      expect(resolved.healthCase.resolvedAt).not.toBeNull();
    }

    const closed = await repo.transition("close", {
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      caseId,
    });
    expect(closed.kind).toBe("success");
    if (closed.kind === "success") {
      expect(closed.healthCase.status).toBe("closed");
      expect(closed.healthCase.closedAt).not.toBeNull();
      expect(closed.healthCase.timeline.map((e) => e.eventType)).toEqual([
        "created",
        "acknowledged",
        "monitoring_started",
        "note_added",
        "awaiting_update",
        "update_received",
        "resolved",
        "closed",
      ]);
    }

    // Closed cases accept no further note.
    const noteAfterClose = await repo.addNote({
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      caseId,
      note: "too late",
    });
    expect(noteAfterClose.kind).toBe("conflict");
  });

  it("full discharge lifecycle: new -> acknowledged -> monitoring -> discharged -> closed", async () => {
    const repo = new DrizzleHealthRepository();
    const created = await repo.create({
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      rollNumber: "TEST-S001",
      category: "hospital_admission",
      severity: "critical",
      description: "Integration test: discharge lifecycle",
    });
    expect(created.kind).toBe("success");
    if (created.kind !== "success") return;
    const caseId = created.healthCase.id;

    await repo.transition("acknowledge", {
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      caseId,
    });
    await repo.transition("startMonitoring", {
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      caseId,
    });
    const discharged = await repo.transition("discharge", {
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      caseId,
    });
    expect(discharged.kind).toBe("success");
    if (discharged.kind === "success") {
      expect(discharged.healthCase.status).toBe("discharged");
      expect(discharged.healthCase.dischargedAt).not.toBeNull();
    }

    const closed = await repo.transition("close", {
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      caseId,
    });
    expect(closed.kind).toBe("success");
    if (closed.kind === "success") expect(closed.healthCase.status).toBe("closed");
  });

  it("new -> cancelled succeeds directly, and denies an out-of-order transition afterward", async () => {
    const repo = new DrizzleHealthRepository();
    const created = await repo.create({
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      rollNumber: "TEST-S001",
      category: "other_medical_event",
      severity: "low",
      description: "Integration test: cancelled case",
    });
    expect(created.kind).toBe("success");
    if (created.kind !== "success") return;

    const cancelled = await repo.transition("cancel", {
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      caseId: created.healthCase.id,
    });
    expect(cancelled.kind).toBe("success");
    if (cancelled.kind === "success") expect(cancelled.healthCase.status).toBe("cancelled");

    const outcome = await repo.transition("acknowledge", {
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      caseId: created.healthCase.id,
    });
    expect(outcome.kind).toBe("conflict");
    if (outcome.kind === "conflict") expect(outcome.currentStatus).toBe("cancelled");
  });

  it("denies an out-of-order transition (new -> resolve, skipping acknowledged/monitoring)", async () => {
    const repo = new DrizzleHealthRepository();
    const created = await repo.create({
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      rollNumber: "TEST-S001",
      category: "accident",
      severity: "critical",
      description: "Integration test: invalid transition",
    });
    expect(created.kind).toBe("success");
    if (created.kind !== "success") return;

    const outcome = await repo.transition("resolve", {
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      caseId: created.healthCase.id,
    });
    expect(outcome.kind).toBe("conflict");
    if (outcome.kind === "conflict") expect(outcome.currentStatus).toBe("new");
  });

  it("denies a cross-hostel transition attempt (anti-enumeration)", async () => {
    const repo = new DrizzleHealthRepository();
    const created = await repo.create({
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      rollNumber: "TEST-S001",
      category: "outpatient_visit",
      severity: "medium",
      description: "Integration test: cross-hostel",
    });
    expect(created.kind).toBe("success");
    if (created.kind !== "success") return;

    const outcome = await repo.transition("acknowledge", {
      staffId: RECEPTION2_STAFF_ID,
      staffRole: "reception_warden",
      caseId: created.healthCase.id,
    });
    expect(outcome.kind).toBe("not_found");
  });

  it("concurrent acknowledge attempts on the same case: exactly one success, one conflict", async () => {
    const repo = new DrizzleHealthRepository();
    const created = await repo.create({
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      rollNumber: "TEST-S001",
      category: "medical_follow_up",
      severity: "low",
      description: "Integration test: concurrency race",
    });
    expect(created.kind).toBe("success");
    if (created.kind !== "success") return;

    const [a, b] = await Promise.all([
      repo.transition("acknowledge", {
        staffId: RECEPTION1_STAFF_ID,
        staffRole: "reception_warden",
        caseId: created.healthCase.id,
      }),
      repo.transition("acknowledge", {
        staffId: RECEPTION1_STAFF_ID,
        staffRole: "reception_warden",
        caseId: created.healthCase.id,
      }),
    ]);

    const kinds = [a.kind, b.kind].sort();
    expect(kinds).toEqual(["conflict", "success"]);
  });

  it("getStatistics: super_admin's total is at least as large as reception1's own hostel-scoped total", async () => {
    const repo = new DrizzleHealthRepository();
    const scoped = await repo.getStatistics({
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
    });
    const unscoped = await repo.getStatistics({
      staffId: SUPER_ADMIN_STAFF_ID,
      staffRole: "super_admin",
    });
    expect(unscoped.active).toBeGreaterThanOrEqual(scoped.active);
  });

  it("list: reception2 (Utkal) never sees a Kalinga case, even unfiltered (anti-enumeration)", async () => {
    const repo = new DrizzleHealthRepository();
    const result = await repo.list({
      staffId: RECEPTION2_STAFF_ID,
      staffRole: "reception_warden",
      page: 1,
      pageSize: 50,
      sortBy: "reportedAt",
      sortDir: "desc",
    });
    expect(result.items.every((i) => i.hostelId !== "a0000000-0000-0000-0000-000000000001")).toBe(
      true,
    );
  });

  // Prompt 11 closure — Medical History condition: the studentId filter
  // narrows to one student's cases while remaining fully hostel-scoped.
  it("list: studentId filter for the seeded Kalinga student (TEST-S001) returns only that student's cases, in scope", async () => {
    const KALINGA_STUDENT_ID = "c0000000-0000-0000-0000-000000000001";
    const repo = new DrizzleHealthRepository();
    const created = await repo.create({
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      rollNumber: "TEST-S001",
      category: "medical_follow_up",
      severity: "low",
      description: "Integration test: medical history filter",
    });
    expect(created.kind).toBe("success");

    const result = await repo.list({
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      studentId: KALINGA_STUDENT_ID,
      page: 1,
      pageSize: 50,
      sortBy: "reportedAt",
      sortDir: "desc",
    });
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((i) => i.studentId === KALINGA_STUDENT_ID)).toBe(true);
  });

  it("list: studentId filter for the Kalinga student, queried by reception2 (Utkal) — zero results, cross-hostel scope still enforced", async () => {
    const KALINGA_STUDENT_ID = "c0000000-0000-0000-0000-000000000001";
    const repo = new DrizzleHealthRepository();
    const result = await repo.list({
      staffId: RECEPTION2_STAFF_ID,
      staffRole: "reception_warden",
      studentId: KALINGA_STUDENT_ID,
      page: 1,
      pageSize: 50,
      sortBy: "reportedAt",
      sortDir: "desc",
    });
    expect(result.items.length).toBe(0);
  });
});
