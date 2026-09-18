import type { Notification } from "../../features/notifications/types";

/**
 * Notification service boundary (Prompt 6 §6/§38, superseding Prompt 0.2's
 * placeholder `NotificationCenterItem`/`listRecent()` interface — same
 * file, same purpose, now a real, tested, always-honest implementation
 * rather than an interface-only stub).
 *
 * **Data availability: FUTURE.** No real notification producer exists
 * anywhere in this repository today:
 *
 * - The `notifications` database table (`packages/db/src/schema/notification.ts`)
 *   grants reception staff (any role) zero SELECT access
 *   (`docs/rls-policy-matrix.md`'s `notifications` section: "staff (any
 *   role) ❌ — not staff-facing data"; only `super_admin` can read it, for
 *   support/debugging, and even then the rows are parent/student
 *   push-delivery-tracking records for leave escalation — not staff work
 *   items in the sense this Notification Center models).
 * - `docs/reception-dashboard-architecture.md` §19 names the actually
 *   intended future real source instead: **live dashboard panels over
 *   `leave_requests`/`leave_approval_events`/future `journey_events`/
 *   `security_incidents`, driven by Realtime + RLS-scoped queries** — i.e.
 *   a future producer that synthesizes notification-shaped events from
 *   operational state changes, not a dedicated notifications table read.
 *
 * This service was deliberately NOT wired to read `leave_requests`/
 * `leave_approval_events` directly in this prompt, even though RLS
 * (`leave_requests_all_reception`) would technically permit it, for the
 * same reasoning `apps/reception-dashboard/docs/dashboard-home.md` §4
 * already recorded for Dashboard Home's identical metric: synthesizing a
 * "Parent Approval requires attention" notification requires genuine Leave
 * Management domain knowledge (which stage means what, how to phrase and
 * prioritize it) that belongs to Phase 3's Leave Queue implementation, not
 * to generic notification infrastructure — and this prompt's own §47/§52
 * explicitly frame event PRODUCTION as a future business module's
 * responsibility, with the Notification Center as the consumer. See
 * `docs/notification-center.md` §5 for the full reasoning and the explicit
 * open question this leaves for whoever builds Leave Management.
 *
 * `list()` therefore always resolves to an empty array today — a real,
 * honest result (there ARE zero real notifications), not a placeholder
 * error. Lifecycle mutations (mark read/acknowledge/dismiss/archive) are
 * deliberately NOT modeled here at all: with no real notification ever
 * present, there is nothing for a "service" to persist, and modeling a
 * mutation method that always no-ops would risk implying a backend contract
 * that does not exist. `contexts/NotificationContext.tsx` implements those
 * transitions as pure client-local presentation state instead, documented
 * there as exactly that.
 */
export interface NotificationService {
  list(): Promise<Notification[]>;
}

export const notificationService: NotificationService = {
  async list() {
    return [];
  },
};
