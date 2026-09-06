import type { LeaveRequestPresentation } from "./types";

/**
 * DEV-ONLY presentation fixtures (Prompt 9A).
 *
 * Purpose: `approvalService.getById()` always throws today (no backend
 * integration exists yet — Prompt 9B's job), so every REAL leave request id
 * renders the honest "unavailable" state. These fixtures let a developer
 * manually navigate to `/(app)/leave/<fixture-id>` (e.g.
 * `/(app)/leave/dev-awaiting`) to visually review every other built
 * presentation state — something otherwise unreachable without a real
 * backend to connect to.
 *
 * Isolation (this prompt's explicit "must not be wired as fake production
 * data" requirement):
 * - Every key is a fixed, non-UUID string (`dev-*`) — it can never collide
 *   with a real `leave_requests.id` (always a UUID), so a real deep link or
 *   dashboard navigation can never accidentally resolve to one.
 * - `app/(app)/leave/[id].tsx` only ever consults this map when
 *   `__DEV__ === true` — a build-time React Native/Expo global that is
 *   always `false` in a release/production bundle, so this branch is
 *   structurally unreachable in production regardless of what id is
 *   navigated to.
 * - Nothing in this file calls a service, mutates state, or is imported by
 *   any production data path (`approvalService`, `useLeaveApprovalDetails`,
 *   `usePendingApprovals` never reference it).
 */
const NOW_ISO = "2026-09-04T09:00:00.000Z";

function fixture(overrides: Partial<LeaveRequestPresentation>): LeaveRequestPresentation {
  return {
    id: "dev-fixture",
    studentId: null,
    student: null,
    leaveType: null,
    destination: null,
    reason: "Attending a family function over the weekend.",
    departureDate: "2026-09-10",
    expectedReturnDate: "2026-09-12",
    status: "awaiting_response",
    createdAt: NOW_ISO,
    expiryTimestamp: null,
    ...overrides,
  };
}

export const LEAVE_APPROVAL_DEV_FIXTURES: Record<string, LeaveRequestPresentation> = {
  "dev-awaiting": fixture({ id: "dev-awaiting", status: "awaiting_response" }),
  "dev-approved": fixture({ id: "dev-approved", status: "approved" }),
  "dev-rejected": fixture({ id: "dev-rejected", status: "rejected" }),
  "dev-expired": fixture({ id: "dev-expired", status: "expired" }),
  "dev-with-countdown": fixture({
    id: "dev-with-countdown",
    status: "awaiting_response",
    // A dev-only, non-authoritative expiry purely to preview CountdownTimer's
    // urgency levels — never derived from or written back to any real state.
    expiryTimestamp: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
  }),
};

export function isDevFixtureId(
  id: string | undefined,
): id is keyof typeof LEAVE_APPROVAL_DEV_FIXTURES {
  return __DEV__ && id !== undefined && id in LEAVE_APPROVAL_DEV_FIXTURES;
}
