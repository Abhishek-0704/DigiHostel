import { describe, it, expect } from "vitest";
import { HealthService } from "./service.js";
import { FakeHealthRepository } from "./__fixtures__/fake-repository.js";
import {
  HealthStudentNotFoundError,
  HealthCaseNotFoundError,
  HealthCaseConflictError,
} from "./errors.js";

const RECEPTION_A = { staffId: "staff-a", staffRole: "reception_warden" as const };
const RECEPTION_B = { staffId: "staff-b", staffRole: "reception_warden" as const };
const SUPER_ADMIN = { staffId: "staff-super", staffRole: "super_admin" as const };

function seed(repo: FakeHealthRepository) {
  repo.staffHostels.set("staff-a", "hostel-a");
  repo.staffHostels.set("staff-b", "hostel-b");
  repo.studentHostels.set("student-1", "hostel-a");
  repo.studentsByRollNumber.set("A001", "student-1");
}

describe("HealthService.create — anti-enumeration and hostel scope", () => {
  it("creates a case for an own-hostel roll number", async () => {
    const repo = new FakeHealthRepository();
    seed(repo);
    const service = new HealthService(repo);

    const healthCase = await service.create({
      ...RECEPTION_A,
      rollNumber: "A001",
      category: "medical_observation",
      severity: "high",
      description: "Fever, sent to infirmary",
    });
    expect(healthCase.status).toBe("new");
    expect(healthCase.category).toBe("medical_observation");
    expect(healthCase.admittedAt).toBeNull();
  });

  it("sets admittedAt automatically for an admission-type category", async () => {
    const repo = new FakeHealthRepository();
    seed(repo);
    const service = new HealthService(repo);

    const healthCase = await service.create({
      ...RECEPTION_A,
      rollNumber: "A001",
      category: "hospital_admission",
      severity: "critical",
      description: "Admitted for observation",
    });
    expect(healthCase.admittedAt).not.toBeNull();
  });

  it("throws HealthStudentNotFoundError for a cross-hostel roll number (not a different error)", async () => {
    const repo = new FakeHealthRepository();
    seed(repo);
    const service = new HealthService(repo);

    await expect(
      service.create({
        ...RECEPTION_B,
        rollNumber: "A001",
        category: "medical_observation",
        severity: "high",
        description: "x",
      }),
    ).rejects.toBeInstanceOf(HealthStudentNotFoundError);
  });

  it("throws the identical error for a nonexistent roll number", async () => {
    const repo = new FakeHealthRepository();
    seed(repo);
    const service = new HealthService(repo);

    await expect(
      service.create({
        ...RECEPTION_A,
        rollNumber: "NONEXISTENT",
        category: "medical_observation",
        severity: "high",
        description: "x",
      }),
    ).rejects.toBeInstanceOf(HealthStudentNotFoundError);
  });
});

describe("HealthService.transition — state machine and hostel scope", () => {
  it("acknowledge -> startMonitoring -> markAwaitingUpdate -> resumeMonitoring -> resolve -> close succeeds end to end", async () => {
    const repo = new FakeHealthRepository();
    seed(repo);
    const service = new HealthService(repo);
    const created = await service.create({
      ...RECEPTION_A,
      rollNumber: "A001",
      category: "medical_observation",
      severity: "high",
      description: "x",
    });

    const acked = await service.transition("acknowledge", { ...RECEPTION_A, caseId: created.id });
    expect(acked.status).toBe("acknowledged");
    expect(acked.assignedStaffId).toBe("staff-a");

    const monitoring = await service.transition("startMonitoring", {
      ...RECEPTION_A,
      caseId: created.id,
    });
    expect(monitoring.status).toBe("monitoring");

    const awaiting = await service.transition("markAwaitingUpdate", {
      ...RECEPTION_A,
      caseId: created.id,
    });
    expect(awaiting.status).toBe("awaiting_update");

    const resumed = await service.transition("resumeMonitoring", {
      ...RECEPTION_A,
      caseId: created.id,
    });
    expect(resumed.status).toBe("monitoring");

    const resolved = await service.transition("resolve", { ...RECEPTION_A, caseId: created.id });
    expect(resolved.status).toBe("resolved");

    const closed = await service.transition("close", { ...RECEPTION_A, caseId: created.id });
    expect(closed.status).toBe("closed");
  });

  it("close also succeeds from discharged (a second valid `from` state)", async () => {
    const repo = new FakeHealthRepository();
    seed(repo);
    const service = new HealthService(repo);
    const created = await service.create({
      ...RECEPTION_A,
      rollNumber: "A001",
      category: "hospital_admission",
      severity: "critical",
      description: "x",
    });
    await service.transition("acknowledge", { ...RECEPTION_A, caseId: created.id });
    await service.transition("startMonitoring", { ...RECEPTION_A, caseId: created.id });
    const discharged = await service.transition("discharge", {
      ...RECEPTION_A,
      caseId: created.id,
    });
    expect(discharged.status).toBe("discharged");
    expect(discharged.dischargedAt).not.toBeNull();

    const closed = await service.transition("close", { ...RECEPTION_A, caseId: created.id });
    expect(closed.status).toBe("closed");
  });

  it("new -> cancelled succeeds directly (false alarm/duplicate)", async () => {
    const repo = new FakeHealthRepository();
    seed(repo);
    const service = new HealthService(repo);
    const created = await service.create({
      ...RECEPTION_A,
      rollNumber: "A001",
      category: "other_medical_event",
      severity: "low",
      description: "x",
    });

    const cancelled = await service.transition("cancel", { ...RECEPTION_A, caseId: created.id });
    expect(cancelled.status).toBe("cancelled");
  });

  it("throws HealthCaseConflictError for an out-of-order transition", async () => {
    const repo = new FakeHealthRepository();
    seed(repo);
    const service = new HealthService(repo);
    const created = await service.create({
      ...RECEPTION_A,
      rollNumber: "A001",
      category: "medical_observation",
      severity: "high",
      description: "x",
    });

    await expect(
      service.transition("resolve", { ...RECEPTION_A, caseId: created.id }),
    ).rejects.toBeInstanceOf(HealthCaseConflictError);
  });

  it("throws HealthCaseConflictError for a duplicate transition", async () => {
    const repo = new FakeHealthRepository();
    seed(repo);
    const service = new HealthService(repo);
    const created = await service.create({
      ...RECEPTION_A,
      rollNumber: "A001",
      category: "medical_observation",
      severity: "high",
      description: "x",
    });
    await service.transition("acknowledge", { ...RECEPTION_A, caseId: created.id });

    await expect(
      service.transition("acknowledge", { ...RECEPTION_A, caseId: created.id }),
    ).rejects.toBeInstanceOf(HealthCaseConflictError);
  });

  it("throws HealthCaseNotFoundError for a cross-hostel transition attempt", async () => {
    const repo = new FakeHealthRepository();
    seed(repo);
    const service = new HealthService(repo);
    const created = await service.create({
      ...RECEPTION_A,
      rollNumber: "A001",
      category: "medical_observation",
      severity: "high",
      description: "x",
    });

    await expect(
      service.transition("acknowledge", { ...RECEPTION_B, caseId: created.id }),
    ).rejects.toBeInstanceOf(HealthCaseNotFoundError);
  });

  it("super_admin can transition any hostel's case", async () => {
    const repo = new FakeHealthRepository();
    seed(repo);
    const service = new HealthService(repo);
    const created = await service.create({
      ...RECEPTION_A,
      rollNumber: "A001",
      category: "medical_observation",
      severity: "high",
      description: "x",
    });

    const acked = await service.transition("acknowledge", { ...SUPER_ADMIN, caseId: created.id });
    expect(acked.status).toBe("acknowledged");
  });
});

describe("HealthService.addNote", () => {
  it("adds a note while the case is not closed/cancelled", async () => {
    const repo = new FakeHealthRepository();
    seed(repo);
    const service = new HealthService(repo);
    const created = await service.create({
      ...RECEPTION_A,
      rollNumber: "A001",
      category: "medical_observation",
      severity: "high",
      description: "x",
    });

    const event = await service.addNote({
      ...RECEPTION_A,
      caseId: created.id,
      note: "Parent informed by phone",
    });
    expect(event.eventType).toBe("note_added");
    expect(event.note).toBe("Parent informed by phone");
  });

  it("throws HealthCaseConflictError when adding a note to a closed case", async () => {
    const repo = new FakeHealthRepository();
    seed(repo);
    const service = new HealthService(repo);
    const created = await service.create({
      ...RECEPTION_A,
      rollNumber: "A001",
      category: "medical_observation",
      severity: "high",
      description: "x",
    });
    await service.transition("acknowledge", { ...RECEPTION_A, caseId: created.id });
    await service.transition("startMonitoring", { ...RECEPTION_A, caseId: created.id });
    await service.transition("resolve", { ...RECEPTION_A, caseId: created.id });
    await service.transition("close", { ...RECEPTION_A, caseId: created.id });

    await expect(
      service.addNote({ ...RECEPTION_A, caseId: created.id, note: "too late" }),
    ).rejects.toBeInstanceOf(HealthCaseConflictError);
  });

  it("throws HealthCaseConflictError when adding a note to a cancelled case", async () => {
    const repo = new FakeHealthRepository();
    seed(repo);
    const service = new HealthService(repo);
    const created = await service.create({
      ...RECEPTION_A,
      rollNumber: "A001",
      category: "medical_observation",
      severity: "low",
      description: "x",
    });
    await service.transition("cancel", { ...RECEPTION_A, caseId: created.id });

    await expect(
      service.addNote({ ...RECEPTION_A, caseId: created.id, note: "too late" }),
    ).rejects.toBeInstanceOf(HealthCaseConflictError);
  });
});

describe("HealthService.getStatistics — hostel scope", () => {
  it("reflects only the caller's own hostel", async () => {
    const repo = new FakeHealthRepository();
    seed(repo);
    const service = new HealthService(repo);
    await service.create({
      ...RECEPTION_A,
      rollNumber: "A001",
      category: "hospital_admission",
      severity: "critical",
      description: "x",
    });

    const statsA = await service.getStatistics(RECEPTION_A);
    expect(statsA.active).toBe(1);
    expect(statsA.critical).toBe(1);
    expect(statsA.newCases).toBe(1);

    const statsB = await service.getStatistics(RECEPTION_B);
    expect(statsB.active).toBe(0);
  });
});
