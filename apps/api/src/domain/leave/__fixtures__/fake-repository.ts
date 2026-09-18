import type {
  AdvanceOutcome,
  DecideOutcome,
  ExitAuthorizationOutcome,
  LeaveRepository,
} from "../repository.js";
import {
  PARENT_DECIDABLE_STATUSES,
  NEXT_ESCALATION_STAGE,
  type AuthorizeExitInput,
  type CreateLeaveRequestInput,
  type DecidableStatus,
  type DecideLeaveRequestInput,
  type ExitAuthorizationView,
  type LeaveApprovalEventView,
  type LeaveRequestView,
  type MarkExpiredInput,
  type StaffLeaveQueueInput,
  type StaffLeaveQueueItemView,
} from "../types.js";

interface FakeStudentInfo {
  rollNumber: string;
  fullName: string;
  hostelId: string | null;
  hostelName: string | null;
  roomId: string | null;
  roomNumber: string | null;
}

/** Deterministic in-memory fake of LeaveRepository — no live database
 * connection. Mirrors the real repository's core invariant (a single
 * conditional "update" that succeeds only from a decidable status) so unit
 * tests of LeaveService's error handling stay meaningful without needing
 * real Postgres. */
export class FakeLeaveRepository implements LeaveRepository {
  leaveRequests = new Map<string, LeaveRequestView>();
  linkedPairs = new Set<string>(); // `${parentId}:${studentId}`
  events: DecideLeaveRequestInput[] = [];
  /** In-memory record of what a real DrizzleLeaveRepository would have
   * scheduled via its JobScheduler — no real queue involved, purely for test
   * assertions on escalation-job scheduling. */
  scheduledEscalationJobs: Array<{ leaveRequestId: string; expectedStage: DecidableStatus }> = [];
  scheduledNotificationJobs: Array<{ leaveRequestId: string; stage: DecidableStatus }> = [];
  /** Hostel scoping for markExpired's staff-scope check — mirrors
   * DrizzleLeaveRepository's hostelScopedForStaff join, in-memory:
   * `${staffId}:${hostelId}` -> true means that staff id belongs to that
   * hostel; a student's hostel is looked up via `studentHostels`. */
  staffHostels = new Map<string, string>(); // staffId -> hostelId
  studentHostels = new Map<string, string>(); // studentId -> hostelId
  /** Approval History (Phase 4 Prompt 10) — mirrors the real repository's
   * leave_approval_events rows in-memory, keyed by leaveRequestId. Populated
   * automatically by decide()/markExpired() (same events the real repository
   * writes) and directly seedable via addApprovalEvent() for tests that need
   * a richer/older timeline than a single fake decision produces. */
  approvalEvents = new Map<string, LeaveApprovalEventView[]>();
  /** Phase 3, Prompt 7C — mirrors leave_exit_authorizations's UNIQUE
   * (leave_request_id) invariant in-memory: at most one entry per
   * leaveRequestId, keyed by leaveRequestId itself (not a separate id), so a
   * second insert attempt is trivially detectable the same way the real
   * repository's unique-violation catch is. */
  exitAuthorizations = new Map<string, ExitAuthorizationView>();
  /** Staff queue enrichment fixture — mirrors the real repository's
   * students/hostels/rooms joins, in-memory. Keyed by studentId. */
  studentDirectory = new Map<string, FakeStudentInfo>();

  addLeaveRequest(view: LeaveRequestView) {
    this.leaveRequests.set(view.id, view);
    return this;
  }
  addApprovalEvent(leaveRequestId: string, event: LeaveApprovalEventView) {
    const existing = this.approvalEvents.get(leaveRequestId) ?? [];
    existing.push(event);
    this.approvalEvents.set(leaveRequestId, existing);
    return this;
  }
  linkParentToStudent(parentId: string, studentId: string) {
    this.linkedPairs.add(`${parentId}:${studentId}`);
    return this;
  }
  linkStaffToHostel(staffId: string, hostelId: string) {
    this.staffHostels.set(staffId, hostelId);
    return this;
  }
  linkStudentToHostel(studentId: string, hostelId: string) {
    this.studentHostels.set(studentId, hostelId);
    return this;
  }
  addStudentInfo(studentId: string, info: FakeStudentInfo) {
    this.studentDirectory.set(studentId, info);
    return this;
  }

  async findAccessibleLeaveRequest(
    leaveRequestId: string,
    parentId: string,
  ): Promise<LeaveRequestView | null> {
    const request = this.leaveRequests.get(leaveRequestId);
    if (!request) return null;
    if (!this.linkedPairs.has(`${parentId}:${request.studentId}`)) return null;
    return request;
  }

  async decide(input: DecideLeaveRequestInput): Promise<DecideOutcome> {
    const request = this.leaveRequests.get(input.leaveRequestId);
    if (!request || !this.linkedPairs.has(`${input.actingParentId}:${request.studentId}`)) {
      return { kind: "not_found" };
    }
    if (!(PARENT_DECIDABLE_STATUSES as readonly string[]).includes(request.status)) {
      return { kind: "conflict", currentStatus: request.status };
    }
    const updated: LeaveRequestView = {
      ...request,
      status: input.decision,
      updatedAt: new Date().toISOString(),
    };
    this.leaveRequests.set(input.leaveRequestId, updated);
    this.events.push(input);
    this.addApprovalEvent(input.leaveRequestId, {
      id: crypto.randomUUID(),
      eventType: "responded",
      response: input.decision,
      biometricConfirmed: true,
      occurredAt: updated.updatedAt,
    });
    return { kind: "success", leaveRequest: updated };
  }

  async create(input: CreateLeaveRequestInput): Promise<LeaveRequestView> {
    // Real UUID (not e.g. "created-1") — routes/leave.ts validates
    // leaveRequestId params as UUIDs, and tests exercise the real
    // create-then-fetch-by-id path through the same route layer.
    const view: LeaveRequestView = {
      id: crypto.randomUUID(),
      studentId: input.studentId,
      reason: input.reason,
      startDate: input.startDate,
      endDate: input.endDate,
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    // Reception-Initiated Parent Approval correction: no escalation job is
    // scheduled here anymore — matches DrizzleLeaveRepository.create()'s
    // real behavior exactly. See startParentApproval() below for the only
    // path that now schedules one.
    this.leaveRequests.set(view.id, view);
    return view;
  }

  async listForStudent(studentId: string): Promise<LeaveRequestView[]> {
    return [...this.leaveRequests.values()]
      .filter((r) => r.studentId === studentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listForParent(parentId: string): Promise<LeaveRequestView[]> {
    return [...this.leaveRequests.values()]
      .filter((r) => this.linkedPairs.has(`${parentId}:${r.studentId}`))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findAccessibleLeaveRequestForStudent(
    leaveRequestId: string,
    studentId: string,
  ): Promise<LeaveRequestView | null> {
    const request = this.leaveRequests.get(leaveRequestId);
    if (!request || request.studentId !== studentId) return null;
    return request;
  }

  async advanceEscalation(
    leaveRequestId: string,
    expectedStage: DecidableStatus,
  ): Promise<AdvanceOutcome> {
    const nextStage = NEXT_ESCALATION_STAGE[expectedStage];
    if (!nextStage) {
      return { kind: "noop" };
    }
    const request = this.leaveRequests.get(leaveRequestId);
    if (!request || request.status !== expectedStage) {
      return { kind: "noop" };
    }
    const updated: LeaveRequestView = {
      ...request,
      status: nextStage,
      updatedAt: new Date().toISOString(),
    };
    this.leaveRequests.set(leaveRequestId, updated);
    if (NEXT_ESCALATION_STAGE[nextStage]) {
      this.scheduledEscalationJobs.push({ leaveRequestId, expectedStage: nextStage });
    }
    this.scheduledNotificationJobs.push({ leaveRequestId, stage: nextStage });
    return { kind: "advanced", leaveRequest: updated, nextStage };
  }

  async markExpired(input: MarkExpiredInput): Promise<DecideOutcome> {
    const request = this.leaveRequests.get(input.leaveRequestId);
    if (!request) {
      return { kind: "not_found" };
    }
    if (input.actingStaffRole !== "super_admin") {
      const staffHostel = this.staffHostels.get(input.actingStaffId);
      const studentHostel = this.studentHostels.get(request.studentId);
      if (!staffHostel || staffHostel !== studentHostel) {
        return { kind: "not_found" };
      }
    }
    if (request.status !== "manual_verification") {
      return { kind: "conflict", currentStatus: request.status };
    }
    const updated: LeaveRequestView = {
      ...request,
      status: "expired",
      updatedAt: new Date().toISOString(),
    };
    this.leaveRequests.set(input.leaveRequestId, updated);
    this.addApprovalEvent(input.leaveRequestId, {
      id: crypto.randomUUID(),
      eventType: "expired",
      response: null,
      biometricConfirmed: false,
      occurredAt: updated.updatedAt,
    });
    return { kind: "success", leaveRequest: updated };
  }

  async listEventsForLeaveRequest(leaveRequestId: string): Promise<LeaveApprovalEventView[]> {
    return [...(this.approvalEvents.get(leaveRequestId) ?? [])].sort((a, b) =>
      a.occurredAt.localeCompare(b.occurredAt),
    );
  }

  async listForStaffQueue(input: StaffLeaveQueueInput): Promise<StaffLeaveQueueItemView[]> {
    const staffHostel = this.staffHostels.get(input.staffId) ?? null;

    const items = [...this.leaveRequests.values()].filter((request) => {
      if (input.staffRole === "super_admin") return true;
      const studentHostel = this.studentHostels.get(request.studentId) ?? null;
      return staffHostel !== null && staffHostel === studentHostel;
    });

    const enriched: StaffLeaveQueueItemView[] = items.map((request) => {
      const info = this.studentDirectory.get(request.studentId) ?? {
        rollNumber: "",
        fullName: "",
        hostelId: this.studentHostels.get(request.studentId) ?? null,
        hostelName: null,
        roomId: null,
        roomNumber: null,
      };
      return {
        ...request,
        studentRollNumber: info.rollNumber,
        studentFullName: info.fullName,
        studentHostelId: info.hostelId,
        studentHostelName: info.hostelName,
        studentRoomId: info.roomId,
        studentRoomNumber: info.roomNumber,
      };
    });

    return enriched.sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
    );
  }

  async findAccessibleLeaveRequestForStaff(
    leaveRequestId: string,
    input: StaffLeaveQueueInput,
  ): Promise<LeaveRequestView | null> {
    const request = this.leaveRequests.get(leaveRequestId);
    if (!request) return null;
    if (input.staffRole === "super_admin") return request;
    const staffHostel = this.staffHostels.get(input.staffId) ?? null;
    const studentHostel = this.studentHostels.get(request.studentId) ?? null;
    if (staffHostel === null || staffHostel !== studentHostel) return null;
    return request;
  }

  async startParentApproval(input: {
    leaveRequestId: string;
    actingStaffId: string;
    actingStaffRole: StaffLeaveQueueInput["staffRole"];
  }): Promise<DecideOutcome> {
    const request = this.leaveRequests.get(input.leaveRequestId);
    if (!request) {
      return { kind: "not_found" };
    }
    if (input.actingStaffRole !== "super_admin") {
      const staffHostel = this.staffHostels.get(input.actingStaffId);
      const studentHostel = this.studentHostels.get(request.studentId);
      if (!staffHostel || staffHostel !== studentHostel) {
        return { kind: "not_found" };
      }
    }
    if (request.status !== "pending") {
      return { kind: "conflict", currentStatus: request.status };
    }
    const updated: LeaveRequestView = {
      ...request,
      status: "father_notified",
      updatedAt: new Date().toISOString(),
    };
    this.leaveRequests.set(input.leaveRequestId, updated);
    this.addApprovalEvent(input.leaveRequestId, {
      id: crypto.randomUUID(),
      eventType: "manual_override",
      response: null,
      biometricConfirmed: false,
      occurredAt: updated.updatedAt,
    });
    this.scheduledEscalationJobs.push({
      leaveRequestId: input.leaveRequestId,
      expectedStage: "father_notified",
    });
    this.scheduledNotificationJobs.push({
      leaveRequestId: input.leaveRequestId,
      stage: "father_notified",
    });
    return { kind: "success", leaveRequest: updated };
  }

  async authorizeExit(input: AuthorizeExitInput): Promise<ExitAuthorizationOutcome> {
    const request = this.leaveRequests.get(input.leaveRequestId);
    if (!request) {
      return { kind: "not_found" };
    }
    if (input.actingStaffRole !== "super_admin") {
      const staffHostel = this.staffHostels.get(input.actingStaffId);
      const studentHostel = this.studentHostels.get(request.studentId);
      if (!staffHostel || staffHostel !== studentHostel) {
        return { kind: "not_found" };
      }
    }
    if (request.status !== "approved") {
      return { kind: "conflict", reason: "not_approved", currentStatus: request.status };
    }
    if (this.exitAuthorizations.has(input.leaveRequestId)) {
      return { kind: "conflict", reason: "already_authorized" };
    }
    const view: ExitAuthorizationView = {
      id: crypto.randomUUID(),
      leaveRequestId: input.leaveRequestId,
      identityConfirmed: input.identityConfirmed,
      authorizedAt: new Date().toISOString(),
    };
    this.exitAuthorizations.set(input.leaveRequestId, view);
    this.addApprovalEvent(input.leaveRequestId, {
      id: crypto.randomUUID(),
      eventType: "manual_override",
      response: null,
      biometricConfirmed: false,
      occurredAt: view.authorizedAt,
    });
    return { kind: "success", exitAuthorization: view };
  }
}
