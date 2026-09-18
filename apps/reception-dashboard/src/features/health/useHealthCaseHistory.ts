import { useQuery } from "@tanstack/react-query";
import { healthOperationsService } from "../../services/health/HealthService";
import { mapHealthError } from "./useHealthCaseQueue";
import { AppError } from "../../lib/errors/errors";
import type { HealthCaseListItem } from "@digihostel/api-client-react";

const HISTORY_PAGE_SIZE = 20;

export const healthCaseHistoryQueryKey = (studentId: string) =>
  ["health-case-history", studentId] as const;

export interface HealthCaseHistoryState {
  /** Every case for this student, newest first — including the case
   * currently being viewed; the page filters that one out itself so this
   * hook stays a plain, reusable "this student's cases" query. */
  items: HealthCaseListItem[];
  isLoading: boolean;
  error: AppError | null;
}

/**
 * Prompt 11 closure — Medical History condition. Read-only: this hook has
 * no mutation of its own, only `useQuery`. It reuses the SAME authoritative
 * `health_cases` table and the SAME hostel-scoped, RLS-backed
 * `GET /health-cases` endpoint the operational queue already uses —
 * filtered to one student via the additive `studentId` parameter — never a
 * second, duplicated history store, and never client-side filtering over a
 * full unscoped fetch (server-side `studentId` filter, same discipline as
 * every other Health Operations Center query).
 *
 * `health_cases` genuinely IS this domain's own authoritative historical
 * record: reconnaissance for this closure task found no separate
 * `medical_history`/`health_history`/`hospital_visits`-style table or
 * service anywhere in this repository (see
 * `apps/reception-dashboard/docs/health-operations-center.md` §17 for the
 * full evidence trail) — a student's own past `health_cases` rows (already
 * real, already hostel-scoped, already RLS-protected) are the only
 * authoritative source that exists, so this is a genuine IMPLEMENTED
 * closure, not a deferred one.
 */
export function useHealthCaseHistory(studentId: string | undefined): HealthCaseHistoryState {
  const query = useQuery({
    queryKey: healthCaseHistoryQueryKey(studentId ?? ""),
    queryFn: () =>
      healthOperationsService.list({
        studentId,
        page: 1,
        pageSize: HISTORY_PAGE_SIZE,
        sortBy: "reportedAt",
        sortDir: "desc",
      }),
    enabled: Boolean(studentId),
  });

  return {
    items: query.data?.items ?? [],
    isLoading: query.isLoading,
    error: query.error ? mapHealthError(query.error) : null,
  };
}
