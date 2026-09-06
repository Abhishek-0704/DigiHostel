/**
 * Home Dashboard static content (Prompt 7) — no React/RN import, independently
 * unit-tested. Every string here is either purely generic (the greeting) or an
 * honest "unavailable" explanation, never a fabricated data value.
 *
 * No parent display-name source exists anywhere in this app's architecture
 * (no `services/profile`, no `/api/v1/profile` route implemented —
 * docs/api-contract.md). `WELCOME_GREETING` is therefore deliberately generic
 * rather than inventing a name field this app has no authoritative way to
 * populate.
 */

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Formats a local date as e.g. "Thursday, 4 September 2026". Hand-rolled
 * rather than `Intl.DateTimeFormat` — same rationale as
 * `features/devices/deviceDisplay.ts`'s `formatDeviceDate`: this app bundles
 * no locale data and Hermes's `Intl` support was never verified in this
 * environment. Uses local (not UTC) date parts deliberately, unlike
 * `formatDeviceDate` — this is "today's date" for the viewer, which should
 * reflect their own device clock/timezone, not a fixed backend timestamp. */
export function formatFullDate(date: Date): string {
  const weekday = WEEKDAY_NAMES[date.getDay()];
  const month = MONTH_NAMES[date.getMonth()];
  return `${weekday}, ${date.getDate()} ${month} ${date.getFullYear()}`;
}

export const WELCOME_GREETING = "Welcome back";

export const STUDENT_SUMMARY_UNAVAILABLE = {
  title: "Student details aren't available yet",
  description:
    "DigiHostel doesn't yet have a way for the Parent app to fetch your linked student's details. This will appear here once that capability is added.",
} as const;

/** `approvalService` (src/services/approvals/approvals.ts) always throws —
 * it is a deliberate, fail-closed, not-yet-implemented placeholder, not a
 * real query this app can call and interpret a result from. This card
 * therefore never calls it; showing a permanent "unavailable" state here is
 * more honest than calling a service known in advance to always reject, or
 * silently swallowing that rejection to show a fake "0 pending" count. */
export const PENDING_ACTIONS_UNAVAILABLE = {
  title: "Pending approvals aren't available yet",
  description:
    "Leave-request approvals aren't wired up in the Parent app yet, even though the backend already supports them. This card will show real pending actions once that feature is built.",
} as const;

/** Same evidence as `features/devices/deviceActivity.ts`'s
 * `DEVICE_ACTIVITY_UNAVAILABLE` (audit_logs has zero RLS grants for the
 * `authenticated` role — packages/db/src/schema/audit.ts), generalized here
 * for a dashboard-wide activity feed rather than one device's history. */
export const RECENT_ACTIVITY_UNAVAILABLE = {
  title: "Recent activity isn't available yet",
  description:
    "DigiHostel doesn't yet keep a unified activity feed the Parent app can read. This will appear here once that capability is added.",
} as const;

export interface FutureInsightPlaceholder {
  id: string;
  label: string;
}

/** UI-only placeholders — no calculation, no backend query, no invented
 * numbers. Labels only, each rendered with "Coming soon" copy by
 * `FutureInsightsSection`. */
export const FUTURE_INSIGHT_PLACEHOLDERS: FutureInsightPlaceholder[] = [
  { id: "approvals-this-month", label: "Approvals this month" },
  { id: "notification-activity", label: "Notification activity" },
  { id: "student-attendance", label: "Student attendance" },
];
