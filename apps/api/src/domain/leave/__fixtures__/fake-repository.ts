import type { DecideOutcome, LeaveRepository } from "../repository.js";
import {
  DECIDABLE_STATUSES,
  type CreateLeaveRequestInput,
  type DecideLeaveRequestInput,
  type LeaveRequestView,
} from "../types.js";

/** Deterministic in-memory fake of LeaveRepository — no live database
 * connection. Mirrors the real repository's core invariant (a single
 * conditional "update" that succeeds only from a decidable status) so unit
 * tests of LeaveService's error handling stay meaningful without needing
 * real Postgres. */
export class FakeLeaveRepository implements LeaveRepository {
  leaveRequests = new Map<string, LeaveRequestView>();
  linkedPairs = new Set<string>(); // `${parentId}:${studentId}`
  events: DecideLeaveRequestInput[] = [];

  addLeaveRequest(view: LeaveRequestView) {
    this.leaveRequests.set(view.id, view);
    return this;
  }
  linkParentToStudent(parentId: string, studentId: string) {
    this.linkedPairs.add(`${parentId}:${studentId}`);
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
    if (!(DECIDABLE_STATUSES as readonly string[]).includes(request.status)) {
      return { kind: "conflict", currentStatus: request.status };
    }
    const updated: LeaveRequestView = {
      ...request,
      status: input.decision,
      updatedAt: new Date().toISOString(),
    };
    this.leaveRequests.set(input.leaveRequestId, updated);
    this.events.push(input);
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
    this.leaveRequests.set(view.id, view);
    return view;
  }

  async listForStudent(studentId: string): Promise<LeaveRequestView[]> {
    return [...this.leaveRequests.values()]
      .filter((r) => r.studentId === studentId)
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
}
