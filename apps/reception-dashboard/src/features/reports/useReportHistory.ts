import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { reportService, type ReportHistoryEntry } from "../../services/reports/ReportService";
import { AppError } from "../../lib/errors/errors";
import { mapReportsError } from "./useReportCatalog";

export const REPORT_HISTORY_QUERY_KEY = ["reports-history"] as const;

export interface ReportHistoryState {
  history: ReportHistoryEntry[];
  isLoading: boolean;
  error: AppError | null;
  refresh: () => Promise<void>;
}

/** The caller's own recent report executions (Phase 6, Prompt 16 §14) — a
 * minimal execution-history record, distinct from a saved template (a
 * configuration, not an event) and from a generated artifact (no file is
 * ever produced by this platform). */
export function useReportHistory(limit = 20): ReportHistoryState {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: [...REPORT_HISTORY_QUERY_KEY, limit],
    queryFn: async () => (await reportService.getHistory(limit)).history,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: REPORT_HISTORY_QUERY_KEY });
  }, [queryClient]);

  return {
    history: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ? mapReportsError(query.error) : null,
    refresh,
  };
}
