import { LeaveIcon, StudentsIcon, EmergencyIcon, HealthIcon } from "../../components/icons";
import { ROUTES } from "../../constants/routes";
import type { MetricCardData } from "./types";

/**
 * Operational Summary metric catalog (Prompt 5 §7). Every metric below is
 * `placeholder`/`future` — NONE has a working data source today, and this
 * file must not pretend otherwise (§34 — "No Fake Test Data" / §7's
 * "never invent numbers such as '12 pending approvals'"). Confirmed by
 * direct inspection, not assumed:
 *
 * - Pending Parent Approvals: `apps/api`'s `GET /leave-requests` returns
 *   `403 role_required` for any caller whose resolved profile is neither
 *   `student` nor `parent` (`apps/api/src/routes/leave.ts`) — a reception
 *   staff session cannot read this today. `LeaveService.ts`'s own doc
 *   comment defers ALL leave-domain wiring to "Phase 3 (Prompt 7A/7B)" —
 *   not this prompt. RLS itself (`leave_requests_all_reception`) would
 *   technically permit a direct Supabase read, but that would mean this
 *   prompt inventing a new, undocumented data pathway ahead of the already-
 *   established roadmap phase that owns this table — recorded as an open
 *   question for Phase 3 in `docs/dashboard-home.md`, not resolved here.
 * - Students Awaiting Verification: `StudentService.ts` is interface-only,
 *   deferred to Phase 4 (Prompt 8).
 * - Emergency Alerts: `EmergencyService.ts` is interface-only; zero Fastify
 *   route surface exists over `security_incidents` at all.
 * - Health Alerts: `HealthService.ts` is interface-only; no data model
 *   exists beyond the SDD's module name.
 * Active Notifications is deliberately NOT in this static array — as of
 * Prompt 6 (Notification Center), it is a genuinely REAL metric (the
 * canonical `unreadCount` from `NotificationContext`, currently `0` because
 * no real notification producer exists yet, per that context's own doc
 * comment — honestly zero, not a placeholder dash). `useOperationalSummary`
 * composes it in dynamically for exactly that reason.
 *
 * Each remaining card still links to its real, existing placeholder route
 * (Prompt 4) via the same permission the sidebar/Quick Actions already gate
 * on — the metric itself is honest about being unavailable; the navigation
 * is real.
 */
export const OPERATIONAL_SUMMARY_METRICS: readonly MetricCardData[] = [
  {
    id: "pending-parent-approvals",
    label: "Pending Parent Approvals",
    value: null,
    availability: "placeholder",
    unavailableReason: "Awaiting Leave Management integration (Phase 3)",
    tone: "neutral",
    icon: LeaveIcon,
    route: ROUTES.leaveQueue,
    requiredPermission: "leave:queue:view",
  },
  {
    id: "students-awaiting-verification",
    label: "Students Awaiting Verification",
    value: null,
    availability: "placeholder",
    unavailableReason: "Awaiting Student Search & Profile (Phase 4)",
    tone: "neutral",
    icon: StudentsIcon,
    route: ROUTES.students,
    requiredPermission: "student:search",
  },
  {
    id: "emergency-alerts",
    label: "Emergency Alerts",
    value: null,
    availability: "future",
    unavailableReason: "Awaiting Emergency Module",
    tone: "neutral",
    icon: EmergencyIcon,
    route: ROUTES.emergency,
    requiredPermission: "emergency:manage",
  },
  {
    id: "health-alerts",
    label: "Health Alerts",
    value: null,
    availability: "future",
    unavailableReason: "Awaiting Health Module",
    tone: "neutral",
    icon: HealthIcon,
    route: ROUTES.health,
    requiredPermission: "health:manage",
  },
] as const;
