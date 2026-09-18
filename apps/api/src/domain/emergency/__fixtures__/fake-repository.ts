import type {
  EmergencyRepository,
  EmergencyCreateOutcome,
  EmergencyTransitionOutcome,
  EmergencyNoteOutcome,
} from "../repository.js";
import { EMERGENCY_TRANSITIONS } from "../types.js";
import type {
  StaffScopeInput,
  EmergencyListInput,
  EmergencyListResult,
  EmergencyDetailView,
  EmergencyStatistics,
  EmergencyCreateInput,
  EmergencyTransitionInput,
  EmergencyNoteInput,
  EmergencyTransitionAction,
  EmergencyStatus,
} from "../types.js";

/** Deterministic in-memory fake of EmergencyRepository — no live database
 * connection. Mirrors the real repository's core invariants (hostel-scoped
 * visibility, anti-enumeration via a single `not_found` for "doesn't exist
 * or not yours", server-authoritative status transitions) so unit tests of
 * EmergencyService's error handling stay meaningful without needing real
 * Postgres — same convention as domain/movement/__fixtures__/fake-repository.ts. */
export class FakeEmergencyRepository implements EmergencyRepository {
  incidents: EmergencyDetailView[] = [];
  staffHostels = new Map<string, string>(); // staffId -> hostelId
  studentHostels = new Map<string, string>(); // studentId -> hostelId
  studentsByRollNumber = new Map<string, string>(); // rollNumber -> studentId
  private nextId = 1;

  private isInScope(hostelId: string | null, scope: StaffScopeInput): boolean {
    if (scope.staffRole === "super_admin") return true;
    const staffHostel = this.staffHostels.get(scope.staffId) ?? null;
    return staffHostel !== null && staffHostel === hostelId;
  }

  async list(input: EmergencyListInput): Promise<EmergencyListResult> {
    const inScope = this.incidents.filter((i) => this.isInScope(i.hostelId, input));
    return { items: inScope, total: inScope.length, page: input.page, pageSize: input.pageSize };
  }

  async getById(incidentId: string, scope: StaffScopeInput): Promise<EmergencyDetailView | null> {
    const incident = this.incidents.find((i) => i.id === incidentId);
    if (!incident) return null;
    if (!this.isInScope(incident.hostelId, scope)) return null;
    return incident;
  }

  async getStatistics(scope: StaffScopeInput): Promise<EmergencyStatistics> {
    const inScope = this.incidents.filter((i) => this.isInScope(i.hostelId, scope));
    return {
      active: inScope.filter((i) => i.status !== "resolved" && i.status !== "closed").length,
      critical: inScope.filter(
        (i) => i.severity === "critical" && i.status !== "resolved" && i.status !== "closed",
      ).length,
      open: inScope.filter((i) => i.status === "open").length,
      acknowledged: inScope.filter((i) => i.status === "acknowledged").length,
      inProgress: inScope.filter((i) => i.status === "in_progress").length,
      resolvedToday: inScope.filter((i) => i.status === "resolved").length,
    };
  }

  async create(input: EmergencyCreateInput): Promise<EmergencyCreateOutcome> {
    const studentId = this.studentsByRollNumber.get(input.rollNumber);
    if (!studentId) return { kind: "student_not_found" };
    const hostelId = this.studentHostels.get(studentId) ?? null;
    if (!this.isInScope(hostelId, input)) return { kind: "student_not_found" };

    const incident: EmergencyDetailView = {
      id: `incident-${this.nextId++}`,
      studentId,
      studentFullName: "Fake Student",
      studentRollNumber: input.rollNumber,
      hostelId,
      hostelName: "Fake Hostel",
      roomNumber: "101",
      category: input.category,
      severity: input.severity,
      status: "open",
      reportedAt: new Date().toISOString(),
      assignedStaffId: null,
      assignedStaffName: null,
      description: input.description,
      resolvedAt: null,
      closedAt: null,
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
    this.incidents.push(incident);
    return { kind: "success", incident };
  }

  async transition(
    action: EmergencyTransitionAction,
    input: EmergencyTransitionInput,
  ): Promise<EmergencyTransitionOutcome> {
    const incident = this.incidents.find((i) => i.id === input.incidentId);
    if (!incident || !this.isInScope(incident.hostelId, input)) return { kind: "not_found" };

    const { from, to, eventType } = EMERGENCY_TRANSITIONS[action];
    if (incident.status !== from) {
      return { kind: "conflict", currentStatus: incident.status as EmergencyStatus };
    }

    incident.status = to;
    if (to === "acknowledged") {
      incident.assignedStaffId = input.staffId;
      incident.assignedStaffName = "Fake Staff";
    }
    if (to === "resolved") incident.resolvedAt = new Date().toISOString();
    if (to === "closed") incident.closedAt = new Date().toISOString();
    incident.timeline.push({
      id: `evt-${this.nextId++}`,
      eventType: eventType as never,
      note: null,
      actorStaffName: null,
      occurredAt: new Date().toISOString(),
    });

    return { kind: "success", incident };
  }

  async addNote(input: EmergencyNoteInput): Promise<EmergencyNoteOutcome> {
    const incident = this.incidents.find((i) => i.id === input.incidentId);
    if (!incident || !this.isInScope(incident.hostelId, input)) return { kind: "not_found" };
    if (incident.status === "closed") {
      return { kind: "conflict", currentStatus: "closed" };
    }

    const event = {
      id: `evt-${this.nextId++}`,
      eventType: "note_added" as const,
      note: input.note,
      actorStaffName: null,
      occurredAt: new Date().toISOString(),
    };
    incident.timeline.push(event);
    return { kind: "success", event };
  }
}
