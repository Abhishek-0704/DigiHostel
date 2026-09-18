import { describe, it, expect } from "vitest";
import { EmergencyService } from "./service.js";
import { FakeEmergencyRepository } from "./__fixtures__/fake-repository.js";
import {
  EmergencyStudentNotFoundError,
  EmergencyIncidentNotFoundError,
  EmergencyConflictError,
} from "./errors.js";

const RECEPTION_A = { staffId: "staff-a", staffRole: "reception_warden" as const };
const RECEPTION_B = { staffId: "staff-b", staffRole: "reception_warden" as const };
const SUPER_ADMIN = { staffId: "staff-super", staffRole: "super_admin" as const };

function seed(repo: FakeEmergencyRepository) {
  repo.staffHostels.set("staff-a", "hostel-a");
  repo.staffHostels.set("staff-b", "hostel-b");
  repo.studentHostels.set("student-1", "hostel-a");
  repo.studentsByRollNumber.set("A001", "student-1");
}

describe("EmergencyService.create — anti-enumeration and hostel scope", () => {
  it("creates an incident for an own-hostel roll number", async () => {
    const repo = new FakeEmergencyRepository();
    seed(repo);
    const service = new EmergencyService(repo);

    const incident = await service.create({
      ...RECEPTION_A,
      rollNumber: "A001",
      category: "medical",
      severity: "critical",
      description: "Collapsed",
    });
    expect(incident.status).toBe("open");
    expect(incident.category).toBe("medical");
  });

  it("throws EmergencyStudentNotFoundError for a cross-hostel roll number (not a different error)", async () => {
    const repo = new FakeEmergencyRepository();
    seed(repo);
    const service = new EmergencyService(repo);

    await expect(
      service.create({
        ...RECEPTION_B,
        rollNumber: "A001",
        category: "medical",
        severity: "critical",
        description: "x",
      }),
    ).rejects.toBeInstanceOf(EmergencyStudentNotFoundError);
  });

  it("throws the identical error for a nonexistent roll number", async () => {
    const repo = new FakeEmergencyRepository();
    seed(repo);
    const service = new EmergencyService(repo);

    await expect(
      service.create({
        ...RECEPTION_A,
        rollNumber: "NONEXISTENT",
        category: "medical",
        severity: "critical",
        description: "x",
      }),
    ).rejects.toBeInstanceOf(EmergencyStudentNotFoundError);
  });
});

describe("EmergencyService.transition — state machine and hostel scope", () => {
  it("acknowledge -> startResponse -> resolve -> close succeeds end to end", async () => {
    const repo = new FakeEmergencyRepository();
    seed(repo);
    const service = new EmergencyService(repo);
    const created = await service.create({
      ...RECEPTION_A,
      rollNumber: "A001",
      category: "fire",
      severity: "high",
      description: "x",
    });

    const acked = await service.transition("acknowledge", {
      ...RECEPTION_A,
      incidentId: created.id,
    });
    expect(acked.status).toBe("acknowledged");
    expect(acked.assignedStaffId).toBe("staff-a");

    const started = await service.transition("startResponse", {
      ...RECEPTION_A,
      incidentId: created.id,
    });
    expect(started.status).toBe("in_progress");

    const resolved = await service.transition("resolve", {
      ...RECEPTION_A,
      incidentId: created.id,
    });
    expect(resolved.status).toBe("resolved");

    const closed = await service.transition("close", { ...RECEPTION_A, incidentId: created.id });
    expect(closed.status).toBe("closed");
  });

  it("throws EmergencyConflictError for an out-of-order transition", async () => {
    const repo = new FakeEmergencyRepository();
    seed(repo);
    const service = new EmergencyService(repo);
    const created = await service.create({
      ...RECEPTION_A,
      rollNumber: "A001",
      category: "fire",
      severity: "high",
      description: "x",
    });

    await expect(
      service.transition("resolve", { ...RECEPTION_A, incidentId: created.id }),
    ).rejects.toBeInstanceOf(EmergencyConflictError);
  });

  it("throws EmergencyIncidentNotFoundError for a cross-hostel transition attempt", async () => {
    const repo = new FakeEmergencyRepository();
    seed(repo);
    const service = new EmergencyService(repo);
    const created = await service.create({
      ...RECEPTION_A,
      rollNumber: "A001",
      category: "fire",
      severity: "high",
      description: "x",
    });

    await expect(
      service.transition("acknowledge", { ...RECEPTION_B, incidentId: created.id }),
    ).rejects.toBeInstanceOf(EmergencyIncidentNotFoundError);
  });

  it("super_admin can transition any hostel's incident", async () => {
    const repo = new FakeEmergencyRepository();
    seed(repo);
    const service = new EmergencyService(repo);
    const created = await service.create({
      ...RECEPTION_A,
      rollNumber: "A001",
      category: "fire",
      severity: "high",
      description: "x",
    });

    const acked = await service.transition("acknowledge", {
      ...SUPER_ADMIN,
      incidentId: created.id,
    });
    expect(acked.status).toBe("acknowledged");
  });
});

describe("EmergencyService.addNote", () => {
  it("adds a note while the incident is not closed", async () => {
    const repo = new FakeEmergencyRepository();
    seed(repo);
    const service = new EmergencyService(repo);
    const created = await service.create({
      ...RECEPTION_A,
      rollNumber: "A001",
      category: "fire",
      severity: "high",
      description: "x",
    });

    const event = await service.addNote({
      ...RECEPTION_A,
      incidentId: created.id,
      note: "Called ambulance",
    });
    expect(event.eventType).toBe("note_added");
    expect(event.note).toBe("Called ambulance");
  });

  it("throws EmergencyConflictError when adding a note to a closed incident", async () => {
    const repo = new FakeEmergencyRepository();
    seed(repo);
    const service = new EmergencyService(repo);
    const created = await service.create({
      ...RECEPTION_A,
      rollNumber: "A001",
      category: "fire",
      severity: "high",
      description: "x",
    });
    await service.transition("acknowledge", { ...RECEPTION_A, incidentId: created.id });
    await service.transition("startResponse", { ...RECEPTION_A, incidentId: created.id });
    await service.transition("resolve", { ...RECEPTION_A, incidentId: created.id });
    await service.transition("close", { ...RECEPTION_A, incidentId: created.id });

    await expect(
      service.addNote({ ...RECEPTION_A, incidentId: created.id, note: "too late" }),
    ).rejects.toBeInstanceOf(EmergencyConflictError);
  });
});

describe("EmergencyService.getStatistics — hostel scope", () => {
  it("reflects only the caller's own hostel", async () => {
    const repo = new FakeEmergencyRepository();
    seed(repo);
    const service = new EmergencyService(repo);
    await service.create({
      ...RECEPTION_A,
      rollNumber: "A001",
      category: "medical",
      severity: "critical",
      description: "x",
    });

    const statsA = await service.getStatistics(RECEPTION_A);
    expect(statsA.active).toBe(1);
    expect(statsA.critical).toBe(1);

    const statsB = await service.getStatistics(RECEPTION_B);
    expect(statsB.active).toBe(0);
  });
});
