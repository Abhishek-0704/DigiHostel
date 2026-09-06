import type { TrustedDeviceSummary } from "../../services/devices/devices";

/**
 * Pure device-display formatting (Prompt 4B) — no React/RN import,
 * independently unit-tested. Never invents a field the backend doesn't
 * provide: `trusted_devices` has no "friendly name" or "last active" column
 * (`packages/db/src/schema/device.ts`), so this module only ever derives a
 * label from `platform` (real data) — it does not fabricate a device name.
 */

const PLATFORM_LABEL: Record<TrustedDeviceSummary["platform"], string> = {
  ios: "iOS Device",
  android: "Android Device",
};

export function deviceDisplayName(platform: TrustedDeviceSummary["platform"]): string {
  return PLATFORM_LABEL[platform];
}

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

/** Formats an ISO timestamp as e.g. "3 Sep 2026". Deliberately hand-rolled
 * rather than `Intl.DateTimeFormat` — this app bundles no locale data and
 * Hermes's `Intl` support is not something this pass verified, so a plain,
 * dependency-free formatter is the safer choice for a small, fixed format.
 * Returns null for a value that doesn't parse, so callers can render a safe
 * fallback instead of "Invalid Date". */
export function formatDeviceDate(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  // UTC getters, deliberately — a calendar-date label should not shift
  // depending on the device's local timezone offset crossing midnight.
  return `${date.getUTCDate()} ${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}
