/**
 * Leave date formatting (Prompt 9A) — no React/RN import. Hand-rolled
 * rather than `Intl.DateTimeFormat`, same rationale as
 * `features/devices/deviceDisplay.ts`'s `formatDeviceDate`.
 *
 * `leave_requests.start_date`/`end_date` are Postgres `date` columns — no
 * time component (`packages/db/src/schema/leave.ts`) — so this formats a
 * calendar date only. Uses UTC getters deliberately, matching
 * `formatDeviceDate`'s own reasoning: a calendar date like "10 Sep 2026"
 * should not shift depending on the viewer's timezone offset, unlike a true
 * point-in-time timestamp (contrast with `notificationFormatting.ts`'s
 * local-time choice for an actual instant).
 */
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatLeaveDate(isoDate: string | null): string {
  if (!isoDate) return "Not available";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "Not available";
  return `${date.getUTCDate()} ${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** Whole-day duration between two calendar dates (inclusive of both
 * endpoints, matching how a parent would naturally count "leave from the
 * 10th to the 12th" as 3 days) — `null` if either date is missing/invalid,
 * or if `endDate` precedes `startDate` (defensive; the backend's own
 * validation already prevents this, but this presentation function makes
 * no assumption about that). */
export function formatLeaveDuration(startIso: string | null, endIso: string | null): string | null {
  if (!startIso || !endIso) return null;
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (days < 1) return null;
  return days === 1 ? "1 day" : `${days} days`;
}
