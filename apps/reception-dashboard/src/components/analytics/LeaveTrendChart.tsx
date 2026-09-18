import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { ChartCard } from "./ChartCard";
import { formatDayLabel } from "../../features/analytics/dateRange";
import type { AnalyticsLeaveTrend } from "@digihostel/api-client-react";
import type { AppError } from "../../lib/errors/errors";

export interface LeaveTrendChartProps {
  trend: AnalyticsLeaveTrend | null;
  isLoading: boolean;
  error: AppError | null;
  onRetry: () => void;
}

/**
 * Leave request trend (Phase 6, Prompt 15 §10/§21) — three distinct series
 * (created / approved / rejected), each from its own authoritative event,
 * never a single collapsed "leave activity" line. See
 * `apps/api/src/domain/analytics/types.ts`'s `LeaveOverviewSummary` doc
 * comment for the exact source of each series.
 */
export function LeaveTrendChart({ trend, isLoading, error, onRetry }: LeaveTrendChartProps) {
  const hasData = trend
    ? trend.createdByDay.some((p) => p.count > 0) ||
      trend.approvedByDay.some((p) => p.count > 0) ||
      trend.rejectedByDay.some((p) => p.count > 0)
    : false;

  const data =
    trend?.createdByDay.map((point, i) => ({
      date: point.date,
      created: point.count,
      approved: trend.approvedByDay[i]?.count ?? 0,
      rejected: trend.rejectedByDay[i]?.count ?? 0,
    })) ?? [];

  const totalCreated = trend?.createdByDay.reduce((sum, p) => sum + p.count, 0) ?? 0;
  const totalApproved = trend?.approvedByDay.reduce((sum, p) => sum + p.count, 0) ?? 0;
  const totalRejected = trend?.rejectedByDay.reduce((sum, p) => sum + p.count, 0) ?? 0;

  return (
    <ChartCard
      title="Leave Requests Over Time"
      description="Daily counts by lifecycle event, within the selected period"
      loading={isLoading}
      error={error?.message}
      onRetry={onRetry}
      isEmpty={!isLoading && !error && !hasData}
      emptyMessage="No leave requests were created, approved, or rejected in this period."
      accessibleSummary={
        trend
          ? `Over the selected period, ${totalCreated} leave requests were created, ${totalApproved} were approved, and ${totalRejected} were rejected.`
          : undefined
      }
    >
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tickFormatter={formatDayLabel} fontSize={11} />
          <YAxis allowDecimals={false} fontSize={11} width={28} />
          <Tooltip labelFormatter={(v) => formatDayLabel(String(v))} />
          <Legend />
          <Line type="monotone" dataKey="created" name="Created" stroke="var(--color-primary)" />
          <Line type="monotone" dataKey="approved" name="Approved" stroke="#2e7d32" />
          <Line type="monotone" dataKey="rejected" name="Rejected" stroke="#c62828" />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
