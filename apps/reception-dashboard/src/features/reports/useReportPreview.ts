import { useCallback, useState } from "react";
import {
  reportService,
  type ReportId,
  type ReportPreviewRequest,
  type ReportPreviewResult,
} from "../../services/reports/ReportService";
import { AppError } from "../../lib/errors/errors";
import { mapReportsError } from "./useReportCatalog";

export interface ReportPreviewState {
  result: ReportPreviewResult | null;
  isLoading: boolean;
  error: AppError | null;
  generate: (reportId: ReportId, request: ReportPreviewRequest) => Promise<void>;
  reset: () => void;
}

/**
 * A manual, user-triggered report generation (Phase 6, Prompt 16) —
 * deliberately NOT auto-fetched on every filter change (a report preview is
 * a bounded but still real query; re-running it on every keystroke would be
 * wasteful and surprising). The caller explicitly clicks "Generate Preview."
 */
export function useReportPreview(): ReportPreviewState {
  const [result, setResult] = useState<ReportPreviewResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const generate = useCallback(async (reportId: ReportId, request: ReportPreviewRequest) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await reportService.preview(reportId, request);
      setResult(data);
    } catch (err) {
      setError(mapReportsError(err));
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { result, isLoading, error, generate, reset };
}
