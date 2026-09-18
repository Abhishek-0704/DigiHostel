import { db, auditLogs } from "@digihostel/db";
import { logger } from "../../lib/logger.js";

/**
 * Staff authentication audit trail (Reception Dashboard Prompt 1 —
 * Authentication Infrastructure). Mirrors the established fire-and-forget
 * audit pattern exactly (apps/api/src/domain/device/service.ts's own
 * `writeAuditLog` — same shape, same "a write failure must never block or
 * fail a security decision that has already been made" reasoning) rather
 * than inventing a second audit mechanism.
 *
 * Only the four events a caller can report while still holding a valid
 * bearer token — `sign_in_success` (aal1 session exists), `mfa_success`
 * (aal2 just reached), `mfa_failure` (a failed verify attempt does not
 * invalidate the pre-existing aal1 session), `sign_out` (reported by the
 * client immediately before it actually calls `supabase.auth.signOut()`).
 * `sign_in_failure` and `session_expired` have no valid token to
 * authenticate a report with at the moment they occur — those are covered
 * by Supabase Auth's own internal `auth.audit_log_entries` table, not
 * fabricated via an unauthenticated (and therefore spoofable/enumerable)
 * endpoint here. See apps/reception-dashboard/docs/authorization.md.
 */
export type StaffAuthAuditEvent = "sign_in_success" | "mfa_success" | "mfa_failure" | "sign_out";

export async function recordStaffAuthEvent(
  staffId: string,
  event: StaffAuthAuditEvent,
): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorType: "staff",
      actorId: staffId,
      action: `staff_${event}`,
      entityType: "staff",
      entityId: staffId,
      metadata: {},
    });
  } catch (err) {
    logger.warn({ err, event }, "auth: staff audit log write failed");
  }
}
