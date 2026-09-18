/**
 * Shared date-range filter model for the Operational Intelligence &
 * Executive Analytics Dashboard (Phase 6, Prompt 15 §16). ONE centralized
 * definition, consumed by every KPI/chart hook on the page — avoids the
 * exact "different date semantics between charts" failure mode §6/§16
 * explicitly warn against.
 *
 * Semantics: both bounds are real UTC instants (ISO 8601, matching every
 * `timestamptz` column in this schema), `dateFrom` inclusive, `dateTo`
 * inclusive — "Last 7 days" means the trailing 7*24h window ending now,
 * not a calendar-week boundary (no such product concept exists anywhere
 * else in this codebase, so none is invented here). The backend
 * independently re-validates and re-bounds every request (never trusts
 * this client-computed range as authoritative) — this module exists so the
 * FRONTEND'S OWN multiple KPI/chart requests agree with each other, not as
 * a security boundary.
 */

export type DateRangePresetId = "7d" | "30d" | "90d";

export interface DateRangePreset {
  id: DateRangePresetId;
  label: string;
  days: number;
}

// 90 days matches the backend's own MAX_ANALYTICS_RANGE_DAYS
// (apps/api/src/domain/analytics/types.ts) — the widest selectable preset
// is deliberately never wider than what the server will actually accept.
export const DATE_RANGE_PRESETS: readonly DateRangePreset[] = [
  { id: "7d", label: "Last 7 days", days: 7 },
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "90d", label: "Last 90 days", days: 90 },
];

export const DEFAULT_DATE_RANGE_PRESET: DateRangePresetId = "7d";

export interface DateRangeValue {
  presetId: DateRangePresetId;
  dateFrom: string;
  dateTo: string;
}

export function buildDateRange(
  presetId: DateRangePresetId,
  now: Date = new Date(),
): DateRangeValue {
  const preset = DATE_RANGE_PRESETS.find((p) => p.id === presetId) ?? DATE_RANGE_PRESETS[0]!;
  const dateTo = now.toISOString();
  const dateFrom = new Date(now.getTime() - preset.days * 24 * 60 * 60 * 1000).toISOString();
  return { presetId: preset.id, dateFrom, dateTo };
}

/** Formats a trend point's `YYYY-MM-DD` date as a short, locale-aware label
 * for chart axes — never re-parses/re-derives the date's meaning, only its
 * display text. */
export function formatDayLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatHourLabel(hour: number): string {
  return `${hour.toString().padStart(2, "0")}:00`;
}
