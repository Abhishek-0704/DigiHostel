import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { ChartCard } from "./ChartCard";
import { formatDayLabel, formatHourLabel } from "../../features/analytics/dateRange";
import type { AnalyticsMovementTrend } from "@digihostel/api-client-react";
import type { AppError } from "../../lib/errors/errors";

export interface MovementTrendChartProps {
  trend: AnalyticsMovementTrend | null;
  isLoading: boolean;
  error: AppError | null;
  onRetry: () => void;
}

/**
 * Hostel-return movement trend (Phase 6, Prompt 15 §9/§21) — a daily count
 * (volume over the period) and an hour-of-day distribution (peak-return
 * period), both from the same real `movements` rows — never an invented
 * duration/completion formula (see `MovementOverviewSummary`'s doc
 * comment in `apps/api/src/domain/analytics/types.ts` for the exact
 * duration calculation this domain uses).
 */
export function MovementTrendChart({ trend, isLoading, error, onRetry }: MovementTrendChartProps) {
  const hasData = trend ? trend.returnsByDay.some((p) => p.count > 0) : false;
  const total = trend?.returnsByDay.reduce((sum, p) => sum + p.count, 0) ?? 0;
  const peakHour = trend?.returnsByHour.reduce((best, h) => (h.count > best.count ? h : best), {
    hour: 0,
    count: 0,
  });

  return (
    <ChartCard
      title="Hostel Returns Over Time"
      description="Daily count and hour-of-day distribution of recorded returns"
      loading={isLoading}
      error={error?.message}
      onRetry={onRetry}
      isEmpty={!isLoading && !error && !hasData}
      emptyMessage="No hostel returns were recorded in this period."
      accessibleSummary={
        trend
          ? `${total} hostel returns were recorded in the selected period.${
              peakHour && peakHour.count > 0
                ? ` The most common return hour was ${formatHourLabel(peakHour.hour)}, with ${peakHour.count} returns.`
                : ""
            }`
          : undefined
      }
    >
      <ResponsiveContainer width="100%" height={200}>
        <BarChart
          data={trend?.returnsByDay ?? []}
          margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tickFormatter={formatDayLabel} fontSize={11} />
          <YAxis allowDecimals={false} fontSize={11} width={28} />
          <Tooltip labelFormatter={(v) => formatDayLabel(String(v))} />
          <Bar dataKey="count" name="Returns" fill="var(--color-primary)" />
        </BarChart>
      </ResponsiveContainer>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart
          data={trend?.returnsByHour ?? []}
          margin={{ top: 16, right: 16, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="hour" tickFormatter={(h) => formatHourLabel(Number(h))} fontSize={10} />
          <YAxis allowDecimals={false} fontSize={11} width={28} />
          <Tooltip labelFormatter={(v) => formatHourLabel(Number(v))} />
          <Bar dataKey="count" name="Returns by hour" fill="#6d4c41" />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
