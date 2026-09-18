import { describe, it, expect } from "vitest";
import { DrizzleEmergencyRepository } from "./repository.js";

/**
 * Real-Postgres integration test — exercises the actual atomic transaction,
 * conditional-UPDATE-WHERE-status transition guard, and genuine concurrency
 * behavior against the local Supabase instance's real seed data, mirroring
 * `domain/movement/repository.integration.test.ts`'s own `RUN`-gated
 * convention.
 */
const RUN = Boolean(process.env.DATABASE_URL);

describe.skipIf(!RUN)("DrizzleEmergencyRepository (real Postgres integration)", () => {
  const RECEPTION1_STAFF_ID = "e0000000-0000-0000-0000-000000000001"; // Kalinga
  const RECEPTION2_STAFF_ID = "e0000000-0000-0000-0000-000000000006"; // Utkal
  const SUPER_ADMIN_STAFF_ID = "e0000000-0000-0000-0000-000000000004";

  it("create: reception1 (Kalinga) reports an incident for the seeded Kalinga student", async () => {
    const repo = new DrizzleEmergencyRepository();
    const outcome = await repo.create({
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      rollNumber: "TEST-S001",
      category: "medical",
      severity: "critical",
      description: "Integration test: collapsed in common room",
    });
    expect(outcome.kind).toBe("success");
    if (outcome.kind === "success") {
      expect(outcome.incident.status).toBe("open");
      expect(outcome.incident.category).toBe("medical");
      expect(outcome.incident.timeline.map((e) => e.eventType)).toEqual(["created"]);
    }
  });

  it("create: reception2 (Utkal) cannot report an incident for the Kalinga student (anti-enumeration)", async () => {
    const repo = new DrizzleEmergencyRepository();
    const outcome = await repo.create({
      staffId: RECEPTION2_STAFF_ID,
      staffRole: "reception_warden",
      rollNumber: "TEST-S001",
      category: "medical",
      severity: "critical",
      description: "Should not be created",
    });
    expect(outcome.kind).toBe("student_not_found");
  });

  it("full legitimate lifecycle: open -> acknowledged -> in_progress -> resolved -> closed", async () => {
    const repo = new DrizzleEmergencyRepository();
    const created = await repo.create({
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      rollNumber: "TEST-S001",
      category: "fire",
      severity: "high",
      description: "Integration test: lifecycle",
    });
    expect(created.kind).toBe("success");
    if (created.kind !== "success") return;
    const incidentId = created.incident.id;

    const acked = await repo.transition("acknowledge", {
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      incidentId,
    });
    expect(acked.kind).toBe("success");
    if (acked.kind === "success") {
      expect(acked.incident.status).toBe("acknowledged");
      expect(acked.incident.assignedStaffId).toBe(RECEPTION1_STAFF_ID);
    }

    const noted = await repo.addNote({
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      incidentId,
      note: "Called ambulance, student conscious.",
    });
    expect(noted.kind).toBe("success");

    const started = await repo.transition("startResponse", {
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      incidentId,
    });
    expect(started.kind).toBe("success");
    if (started.kind === "success") expect(started.incident.status).toBe("in_progress");

    const resolved = await repo.transition("resolve", {
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      incidentId,
    });
    expect(resolved.kind).toBe("success");
    if (resolved.kind === "success") {
      expect(resolved.incident.status).toBe("resolved");
      expect(resolved.incident.resolvedAt).not.toBeNull();
    }

    const closed = await repo.transition("close", {
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      incidentId,
    });
    expect(closed.kind).toBe("success");
    if (closed.kind === "success") {
      expect(closed.incident.status).toBe("closed");
      expect(closed.incident.closedAt).not.toBeNull();
      expect(closed.incident.timeline.map((e) => e.eventType)).toEqual([
        "created",
        "acknowledged",
        "note_added",
        "response_started",
        "resolved",
        "closed",
      ]);
    }

    // Closed incidents accept no further note.
    const noteAfterClose = await repo.addNote({
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      incidentId,
      note: "too late",
    });
    expect(noteAfterClose.kind).toBe("conflict");
  });

  it("denies an out-of-order transition (open -> resolve, skipping acknowledged/in_progress)", async () => {
    const repo = new DrizzleEmergencyRepository();
    const created = await repo.create({
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      rollNumber: "TEST-S001",
      category: "violence",
      severity: "critical",
      description: "Integration test: invalid transition",
    });
    expect(created.kind).toBe("success");
    if (created.kind !== "success") return;

    const outcome = await repo.transition("resolve", {
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      incidentId: created.incident.id,
    });
    expect(outcome.kind).toBe("conflict");
    if (outcome.kind === "conflict") expect(outcome.currentStatus).toBe("open");
  });

  it("denies a cross-hostel transition attempt (anti-enumeration)", async () => {
    const repo = new DrizzleEmergencyRepository();
    const created = await repo.create({
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      rollNumber: "TEST-S001",
      category: "harassment",
      severity: "medium",
      description: "Integration test: cross-hostel",
    });
    expect(created.kind).toBe("success");
    if (created.kind !== "success") return;

    const outcome = await repo.transition("acknowledge", {
      staffId: RECEPTION2_STAFF_ID,
      staffRole: "reception_warden",
      incidentId: created.incident.id,
    });
    expect(outcome.kind).toBe("not_found");
  });

  it("concurrent acknowledge attempts on the same incident: exactly one success, one conflict", async () => {
    const repo = new DrizzleEmergencyRepository();
    const created = await repo.create({
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      rollNumber: "TEST-S001",
      category: "infrastructure",
      severity: "low",
      description: "Integration test: concurrency race",
    });
    expect(created.kind).toBe("success");
    if (created.kind !== "success") return;

    const [a, b] = await Promise.all([
      repo.transition("acknowledge", {
        staffId: RECEPTION1_STAFF_ID,
        staffRole: "reception_warden",
        incidentId: created.incident.id,
      }),
      repo.transition("acknowledge", {
        staffId: RECEPTION1_STAFF_ID,
        staffRole: "reception_warden",
        incidentId: created.incident.id,
      }),
    ]);

    const kinds = [a.kind, b.kind].sort();
    expect(kinds).toEqual(["conflict", "success"]);
  });

  it("getStatistics: super_admin's total is at least as large as reception1's own hostel-scoped total", async () => {
    const repo = new DrizzleEmergencyRepository();
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

  it("list: reception2 (Utkal) never sees a Kalinga incident, even unfiltered (anti-enumeration)", async () => {
    const repo = new DrizzleEmergencyRepository();
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
});
