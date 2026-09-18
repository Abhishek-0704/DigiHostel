import { recordStaffAuthEvent as recordStaffAuthEventApiCall } from "@digihostel/api-client-react";
import { logger } from "../../lib/logging/logger";

export type StaffAuthAuditEvent = "sign_in_success" | "mfa_success" | "mfa_failure" | "sign_out";

/**
 * Frontend counterpart of apps/api/src/domain/auth/staffAuthAudit.ts
 * (Prompt 1 — Authentication Infrastructure). Reports an already-happened
 * staff authentication event to the backend's own `audit_logs` trail via
 * the generated `POST /auth/staff/audit-events` client (OpenAPI-first —
 * packages/api-spec/openapi.yaml, never hand-written).
 *
 * Fire-and-forget from the caller's perspective, mirroring the backend's
 * own "an audit write failure must never block or fail a security decision
 * that has already been made" convention (device/service.ts) — a failed
 * report here never throws back into AuthContext/sign-in flow, only logs.
 * Called automatically by AuthContext for the three events it can observe
 * as real state transitions (sign_in_success, mfa_success, sign_out) —
 * `mfa_failure` has no observable state transition (a failed verify leaves
 * the session exactly as it was) and must be called explicitly by whichever
 * screen catches the verify error (Prompt 2's login/MFA screen).
 */
export const staffAuthAuditService = {
  async record(event: StaffAuthAuditEvent): Promise<void> {
    try {
      await recordStaffAuthEventApiCall({ event });
    } catch (err) {
      logger.warn("auth: staff audit event report failed", {
        event,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  },
};
