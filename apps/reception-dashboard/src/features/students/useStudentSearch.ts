import { useQuery } from "@tanstack/react-query";
import {
  studentOperationsService,
  type StudentSearchParams,
} from "../../services/students/StudentService";
import { AppError, toAppError, safeMessageFor } from "../../lib/errors/errors";
import type { StudentSearchResult } from "@digihostel/api-client-react";

/** Maps the generated client's thrown `{status, message}` shape to this
 * app's own AppError taxonomy — same discipline as `useLeaveQueue.ts`'s
 * `mapLeaveQueueError`. */
function mapStudentSearchError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status: unknown }).status;
    if (status === 401)
      return new AppError("unauthenticated", safeMessageFor("unauthenticated"), err);
    if (status === 403) return new AppError("forbidden", safeMessageFor("forbidden"), err);
    if (status === 400) return new AppError("validation", safeMessageFor("validation"), err);
  }
  return toAppError(err);
}

export const STUDENT_SEARCH_QUERY_KEY = (params: StudentSearchParams) =>
  ["student-search", params] as const;

export interface StudentSearchState {
  result: StudentSearchResult | null;
  isLoading: boolean;
  isFetching: boolean;
  error: AppError | null;
}

/**
 * Server-state layer for Student Operations Center search (Phase 4, Prompt
 * 8) — a thin `useQuery` wrapper, matching `useLeaveQueue`'s established
 * convention. The caller (StudentsPage) owns all UI state (query text,
 * page, sort) and passes the already-debounced search params in; this hook
 * performs no debouncing of its own — that is the page's responsibility
 * (StudentsPage combines the raw input with `useDebouncedValue`, then
 * passes the settled value here), keeping this hook a pure server-state
 * boundary. `keepPreviousData`-equivalent behavior (TanStack Query v5's
 * `placeholderData`) avoids a full loading-skeleton flash on every
 * page/sort change — only the FIRST query for a given search truly loads.
 */
export function useStudentSearch(params: StudentSearchParams): StudentSearchState {
  const query = useQuery({
    queryKey: STUDENT_SEARCH_QUERY_KEY(params),
    queryFn: () => studentOperationsService.search(params),
    placeholderData: (previous) => previous,
  });

  return {
    result: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ? mapStudentSearchError(query.error) : null,
  };
}
