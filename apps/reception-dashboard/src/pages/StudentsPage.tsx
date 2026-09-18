import { useState } from "react";
import { ContentLayout } from "../layouts/ContentLayout";
import { getBreadcrumbTrail } from "../lib/navigation/navigationConfig";
import { useAuthorization } from "../contexts/AuthorizationContext";
import { useStudentSearch } from "../features/students";
import { useDebouncedValue } from "../hooks";
import { SearchInput, Button } from "../components/ui";
import { StudentResultsTable } from "../components/students";
import styles from "./StudentsPage.module.css";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

type SortOption = "fullName-asc" | "fullName-desc" | "rollNumber-asc" | "rollNumber-desc";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "fullName-asc", label: "Name (A–Z)" },
  { value: "fullName-desc", label: "Name (Z–A)" },
  { value: "rollNumber-asc", label: "Roll Number (ascending)" },
  { value: "rollNumber-desc", label: "Roll Number (descending)" },
];

/**
 * Student Operations Center — Search (Phase 4, Prompt 8), replacing Prompt
 * 0.2's placeholder. Composes Prompt 4's `ContentLayout` shell exactly like
 * `LeaveQueuePage`. Two state layers, same split `docs/leave-queue.md` §6
 * already established: page-local UI state (query text, sort, page — plain
 * `useState`, held here) and server state (`useStudentSearch`, a real,
 * hostel-scoped, server-side-paginated query against
 * `GET /api/v1/students`). The raw query text is debounced
 * (`useDebouncedValue`, 300ms) before it ever reaches the query key — every
 * keystroke does NOT trigger a network request, and changing the debounced
 * value (or sort/page) automatically produces a new TanStack Query cache
 * entry (`STUDENT_SEARCH_QUERY_KEY`), which is what actually cancels/
 * supersedes a stale in-flight request rather than a manual
 * AbortController — TanStack Query's own query-key-keyed cache already
 * provides that stale-request protection.
 */
export default function StudentsPage() {
  const { role, hostelId } = useAuthorization();
  const [rawQuery, setRawQuery] = useState("");
  const [sort, setSort] = useState<SortOption>("fullName-asc");
  const [page, setPage] = useState(1);

  const debouncedQuery = useDebouncedValue(rawQuery, SEARCH_DEBOUNCE_MS);
  const [sortBy, sortDir] = sort.split("-") as ["fullName" | "rollNumber", "asc" | "desc"];

  const { result, isLoading, isFetching, error } = useStudentSearch({
    q: debouncedQuery.trim() === "" ? undefined : debouncedQuery.trim(),
    page,
    pageSize: PAGE_SIZE,
    sortBy,
    sortDir,
  });

  function handleQueryChange(value: string) {
    setRawQuery(value);
    setPage(1); // a changed search always restarts pagination
  }

  function handleSortChange(value: SortOption) {
    setSort(value);
    setPage(1);
  }

  const total = result?.total ?? 0;
  const totalPages = total === 0 ? 1 : Math.ceil(total / PAGE_SIZE);
  const hasQuery = debouncedQuery.trim() !== "";

  return (
    <ContentLayout
      title="Student Operations"
      description="Search for a student to review their hostel, guardian, and current leave context."
      breadcrumb={getBreadcrumbTrail("students")}
      width="full"
      actions={
        <span className={styles.scopeIndicator}>
          {role === "super_admin" ? "All hostels" : hostelId ? "Hostel-scoped" : "Unscoped"}
        </span>
      }
    >
      <div className={styles.page}>
        <div className={styles.toolbarRow}>
          <SearchInput
            label="Search students"
            placeholder="Search by name or roll number"
            value={rawQuery}
            onChange={(e) => handleQueryChange(e.target.value)}
          />
          <label className={styles.sortLabel}>
            Sort by
            <select
              className={styles.sortSelect}
              value={sort}
              onChange={(e) => handleSortChange(e.target.value as SortOption)}
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <StudentResultsTable
          items={result?.items ?? []}
          loading={isLoading}
          error={error ? { message: error.userMessage } : undefined}
          emptyTitle={hasQuery ? "No students match this search" : "No students in your scope"}
          emptyDescription={
            hasQuery
              ? "Try a different name or roll number."
              : "No students are currently assigned to your hostel."
          }
        />

        {total > 0 && (
          <div className={styles.pagination} aria-live="polite">
            <span className={styles.pageInfo}>
              Page {page} of {totalPages} · {total} student{total === 1 ? "" : "s"}
              {isFetching && !isLoading ? " · Updating…" : ""}
            </span>
            <div className={styles.pageButtons}>
              <Button
                type="button"
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
