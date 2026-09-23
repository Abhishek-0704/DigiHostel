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
 * Only the events a caller can report while still holding a valid
 * bearer token — `sign_in_success` (aal1 session exists), `mfa_success`
 * (aal2 just reached), `mfa_failure` (a failed verify attempt does not
 * invalidate the pre-existing aal1 session), `sign_out` (reported by the
 * client immediately before it actually calls `supabase.auth.signOut()`).
 * `sign_in_failure` and `session_expired` have no valid token to
 * authenticate a report with at the moment they occur — those are covered
 * by Supabase Auth's own internal `auth.audit_log_entries` table, not
 * fabricated via an unauthenticated (and therefore spoofable/enumerable)
 * endpoint here. See apps/reception-dashboard/docs/authorization.md.
 *
 * `sessions_signed_out_others` (Phase 7, Prompt 17 — Administrative
 * Profile & Personal Preferences Center, Session Management) is reported by
 * the client immediately AFTER a successful
 * `supabase.auth.signOut({ scope: "others" })` call — GoTrue's own native
 * mechanism for a session to revoke every OTHER session belonging to the
 * SAME authenticated user, using nothing but that session's own access
 * token (no user/session identifier is ever accepted from the client —
 * "which sessions" is entirely derived server-side by Supabase Auth from
 * the presented token, so there is no parameter here or in GoTrue's own API
 * through which one user could target another's session). This is
 * deliberately NOT a new invalidation mechanism and has nothing to do with
 * Force Sign-Out's `staff.sessions_invalidated_before` (QG-04/F-QG05-03,
 * certified, untouched by this feature) — two independent, non-conflicting
 * layers: this one signs out other GoTrue sessions' refresh tokens; that
 * one is Fastify's own additive per-request `iat` watermark check.
 */
export type StaffAuthAuditEvent =
  "sign_in_success" | "mfa_success" | "mfa_failure" | "sign_out" | "sessions_signed_out_others";

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
