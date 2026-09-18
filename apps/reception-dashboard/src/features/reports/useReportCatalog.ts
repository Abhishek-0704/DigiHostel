import { useQuery } from "@tanstack/react-query";
import { reportService, type ReportDefinition } from "../../services/reports/ReportService";
import { AppError, toAppError, safeMessageFor } from "../../lib/errors/errors";

export function mapReportsError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status: unknown }).status;
    if (status === 401)
      return new AppError("unauthenticated", safeMessageFor("unauthenticated"), err);
    if (status === 403) return new AppError("forbidden", safeMessageFor("forbidden"), err);
    if (status === 400) return new AppError("validation", safeMessageFor("validation"), err);
    if (status === 404) return new AppError("not_found", safeMessageFor("not_found"), err);
    if (status === 409) return new AppError("conflict", safeMessageFor("conflict"), err);
  }
  return toAppError(err);
}

export const REPORTS_CATALOG_QUERY_KEY = ["reports-catalog"] as const;

export interface ReportCatalogState {
  reports: ReportDefinition[];
  isLoading: boolean;
  error: AppError | null;
  refresh: () => Promise<void>;
}

/**
 * The fixed, server-owned report catalog (Phase 6, Prompt 16) — every
 * report's available fields/filters/status is server-derived; an
 * `unavailable` report is rendered honestly (§37), never hidden or forced
 * into existence on the frontend.
 */
export function useReportCatalog(): ReportCatalogState {
  const query = useQuery({
    queryKey: REPORTS_CATALOG_QUERY_KEY,
    queryFn: async () => (await reportService.getCatalog()).reports,
  });

  return {
    reports: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ? mapReportsError(query.error) : null,
    refresh: async () => {
      await query.refetch();
    },
  };
}

export { mapReportsError as mapReportCatalogError };
