/**
 * Service boundary (Prompt 0.2 §18) — interface only, no implementation.
 * Explicitly deferred: "ParentApprovalService must NOT yet implement:
 * session creation, notification triggering, escalation, parent approval."
 *
 * Boundary reminder (Prompt 0.2 §2/§32, docs/reception-dashboard-architecture.md
 * §10): this service will only ever INITIATE and MONITOR a parent approval
 * session from the Reception side. It must never implement parent
 * authentication, trusted-device verification, biometric verification, or
 * the approval/rejection decision itself — those remain owned entirely by
 * the Parent Application (ADR-001, ADR-003, ADR-014).
 */
export interface ParentApprovalStatus {
  leaveRequestId: string;
  status: string;
}

export interface ParentApprovalService {
  getStatus(leaveRequestId: string): Promise<ParentApprovalStatus | null>;
}
