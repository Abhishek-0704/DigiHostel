import type {
  HealthRepository,
  HealthCaseCreateOutcome,
  HealthCaseTransitionOutcome,
  HealthCaseNoteOutcome,
} from "../repository.js";
import { HEALTH_CASE_TRANSITIONS, ADMISSION_CATEGORIES } from "../types.js";
import type {
  StaffScopeInput,
  HealthCaseListInput,
  HealthCaseListResult,
  HealthCaseDetailView,
  HealthCaseStatistics,
  HealthCaseCreateInput,
  HealthCaseTransitionInput,
  HealthCaseNoteInput,
  HealthCaseTransitionAction,
  HealthCaseStatus,
} from "../types.js";

/** Deterministic in-memory fake of HealthRepository — no live database
 * connection. Mirrors FakeEmergencyRepository's exact shape/discipline
 * (hostel-scoped visibility, anti-enumeration, server-authoritative status
 * transitions) so unit tests of HealthService's error handling stay
 * meaningful without needing real Postgres. */
export class FakeHealthRepository implements HealthRepository {
  cases: HealthCaseDetailView[] = [];
  staffHostels = new Map<string, string>(); // staffId -> hostelId
  studentHostels = new Map<string, string>(); // studentId -> hostelId
  studentsByRollNumber = new Map<string, string>(); // rollNumber -> studentId
  private nextId = 1;

  private isInScope(hostelId: string | null, scope: StaffScopeInput): boolean {
    if (scope.staffRole === "super_admin") return true;
    const staffHostel = this.staffHostels.get(scope.staffId) ?? null;
    return staffHostel !== null && staffHostel === hostelId;
  }

  async list(input: HealthCaseListInput): Promise<HealthCaseListResult> {
    let inScope = this.cases.filter((c) => this.isInScope(c.hostelId, input));
    // Prompt 11 closure (Medical History) — same additive, non-trust-
    // boundary filter as DrizzleHealthRepository.list(): applied AFTER
    // hostel scoping, never in place of it.
    if (input.studentId) {
      inScope = inScope.filter((c) => c.studentId === input.studentId);
    }
    return { items: inScope, total: inScope.length, page: input.page, pageSize: input.pageSize };
  }

  async getById(caseId: string, scope: StaffScopeInput): Promise<HealthCaseDetailView | null> {
    const healthCase = this.cases.find((c) => c.id === caseId);
    if (!healthCase) return null;
    if (!this.isInScope(healthCase.hostelId, scope)) return null;
    return healthCase;
  }

  async getStatistics(scope: StaffScopeInput): Promise<HealthCaseStatistics> {
    const inScope = this.cases.filter((c) => this.isInScope(c.hostelId, scope));
    const terminal = new Set(["resolved", "discharged", "closed", "cancelled"]);
    return {
      active: inScope.filter((c) => !terminal.has(c.status)).length,
      critical: inScope.filter((c) => c.severity === "critical" && !terminal.has(c.status)).length,
      newCases: inScope.filter((c) => c.status === "new").length,
      monitoring: inScope.filter((c) => c.status === "monitoring").length,
      awaitingUpdate: inScope.filter((c) => c.status === "awaiting_update").length,
      admittedToday: inScope.filter((c) => c.admittedAt !== null).length,
      dischargedToday: inScope.filter((c) => c.dischargedAt !== null).length,
    };
  }

  async create(input: HealthCaseCreateInput): Promise<HealthCaseCreateOutcome> {
    const studentId = this.studentsByRollNumber.get(input.rollNumber);
    if (!studentId) return { kind: "student_not_found" };
    const hostelId = this.studentHostels.get(studentId) ?? null;
    if (!this.isInScope(hostelId, input)) return { kind: "student_not_found" };

    const admittedAt = ADMISSION_CATEGORIES.includes(input.category)
      ? new Date().toISOString()
      : null;

    const healthCase: HealthCaseDetailView = {
      id: `case-${this.nextId++}`,
      studentId,
      studentFullName: "Fake Student",
      studentRollNumber: input.rollNumber,
      hostelId,
      hostelName: "Fake Hostel",
      roomNumber: "101",
      category: input.category,
      severity: input.severity,
      status: "new",
      reportedAt: new Date().toISOString(),
      admittedAt,
      latestUpdateAt: new Date().toISOString(),
      assignedStaffId: null,
      assignedStaffName: null,
      description: input.description,
      resolvedAt: null,
      dischargedAt: null,
      closedAt: null,
      cancelledAt: null,
      timeline: [
        {
          id: "evt-1",
          eventType: "created",
          note: null,
          actorStaffName: null,
          occurredAt: new Date().toISOString(),
        },
      ],
    };
    this.cases.push(healthCase);
    return { kind: "success", healthCase };
  }

  async transition(
    action: HealthCaseTransitionAction,
    input: HealthCaseTransitionInput,
  ): Promise<HealthCaseTransitionOutcome> {
    const healthCase = this.cases.find((c) => c.id === input.caseId);
    if (!healthCase || !this.isInScope(healthCase.hostelId, input)) return { kind: "not_found" };

    // Same cast as DrizzleHealthRepository.transition() — see that file's
    // comment for why this is needed.
    const { from, to, eventType } = HEALTH_CASE_TRANSITIONS[action] as {
      from: HealthCaseStatus | readonly HealthCaseStatus[];
      to: HealthCaseStatus;
      eventType: (typeof HEALTH_CASE_TRANSITIONS)[HealthCaseTransitionAction]["eventType"];
    };
    const fromStates: HealthCaseStatus[] = Array.isArray(from) ? [...from] : [from];
    if (!fromStates.includes(healthCase.status)) {
      return { kind: "conflict", currentStatus: healthCase.status as HealthCaseStatus };
    }

    healthCase.status = to;
    if (to === "acknowledged") {
      healthCase.assignedStaffId = input.staffId;
      healthCase.assignedStaffName = "Fake Staff";
    }
    if (to === "resolved") healthCase.resolvedAt = new Date().toISOString();
    if (to === "discharged") healthCase.dischargedAt = new Date().toISOString();
    if (to === "closed") healthCase.closedAt = new Date().toISOString();
    if (to === "cancelled") healthCase.cancelledAt = new Date().toISOString();
    healthCase.timeline.push({
      id: `evt-${this.nextId++}`,
      eventType: eventType as never,
      note: null,
      actorStaffName: null,
      occurredAt: new Date().toISOString(),
    });

    return { kind: "success", healthCase };
  }

  async addNote(input: HealthCaseNoteInput): Promise<HealthCaseNoteOutcome> {
    const healthCase = this.cases.find((c) => c.id === input.caseId);
    if (!healthCase || !this.isInScope(healthCase.hostelId, input)) return { kind: "not_found" };
    if (healthCase.status === "closed" || healthCase.status === "cancelled") {
      return { kind: "conflict", currentStatus: healthCase.status as HealthCaseStatus };
    }

    const event = {
      id: `evt-${this.nextId++}`,
      eventType: "note_added" as const,
      note: input.note,
      actorStaffName: null,
      occurredAt: new Date().toISOString(),
    };
    healthCase.timeline.push(event);
    return { kind: "success", event };
  }
}
