/**
 * Notification timestamp formatting (Prompt 8) — no React/RN import.
 * Hand-rolled rather than `Intl.DateTimeFormat`, same rationale as
 * `features/devices/deviceDisplay.ts`'s `formatDeviceDate`: no locale data
 * bundled, Hermes `Intl` support unverified in this environment.
 *
 * Uses LOCAL (not UTC) date/time parts, deliberately — a notification
 * timestamp is "when this happened for you," which should track the
 * viewer's own device clock/timezone (same reasoning as the Home
 * Dashboard's `WelcomeHeader` — `docs/foundation.md` §13), unlike
 * `formatDeviceDate`'s UTC calendar-date choice for a fixed registration
 * day.
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

export function formatNotificationTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}, ${hours}:${minutes}`;
}
