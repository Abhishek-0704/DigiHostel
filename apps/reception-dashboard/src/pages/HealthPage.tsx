import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ContentLayout } from "../layouts/ContentLayout";
import { getBreadcrumbTrail } from "../lib/navigation/navigationConfig";
import { useAuthorization } from "../contexts/AuthorizationContext";
import { useHealthCaseQueue, useHealthCaseStatistics } from "../features/health";
import { useDebouncedValue, useHealthCaseQueueRealtime } from "../hooks";
import { SearchInput, Button } from "../components/ui";
import {
  HealthFilterBar,
  HealthCaseTable,
  HealthStatisticsStrip,
  emptyHealthCaseFilters,
  type HealthCaseFilters,
} from "../components/health";
import styles from "./HealthPage.module.css";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

type SortOption = "reportedAt-desc" | "reportedAt-asc" | "severity-asc" | "severity-desc";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "reportedAt-desc", label: "Newest first" },
  { value: "reportedAt-asc", label: "Oldest first" },
  { value: "severity-asc", label: "Priority (most severe first)" },
  { value: "severity-desc", label: "Priority (least severe first)" },
];

/**
 * Health Operations Center — Queue (Phase 4, Prompt 11), replacing Prompt
 * 0.2's "No backend/data model exists yet" placeholder. Composes the
 * existing `ContentLayout` shell exactly like every certified page since
 * Prompt 4. Server-side pagination/filtering/sorting (mirrors
 * `EmergencyPage`'s established pattern — this dataset can genuinely grow
 * large over time). Realtime-driven invalidation via
 * `useHealthCaseQueueRealtime` keeps the queue live without polling.
 *
 * Case creation is deliberately NOT duplicated here — "Report Health Case"
 * is a real quick action on the Student Operations Center's profile page
 * (StudentProfilePage.tsx), which already has a genuine student-search/
 * identification flow.
 */
export default function HealthPage() {
  const { role, hostelId } = useAuthorization();
  const [rawQuery, setRawQuery] = useState("");
  const [filters, setFilters] = useState<HealthCaseFilters>(emptyHealthCaseFilters());
  const [sort, setSort] = useState<SortOption>("reportedAt-desc");
  const [page, setPage] = useState(1);

  const debouncedQuery = useDebouncedValue(rawQuery, SEARCH_DEBOUNCE_MS);
  const [sortBy, sortDir] = sort.split("-") as ["reportedAt" | "severity", "asc" | "desc"];

  const { result, isLoading, isFetching, error } = useHealthCaseQueue({
    q: debouncedQuery.trim() === "" ? undefined : debouncedQuery.trim(),
    category: filters.categories.length > 0 ? filters.categories : undefined,
    severity: filters.severities.length > 0 ? filters.severities : undefined,
    status: filters.statuses.length > 0 ? filters.statuses : undefined,
    activeOnly: filters.statuses.length === 0 ? filters.activeOnly : undefined,
    page,
    pageSize: PAGE_SIZE,
    sortBy,
    sortDir,
  });
  const {
    statistics,
    isLoading: statsLoading,
    refresh: refreshStatistics,
  } = useHealthCaseStatistics();
  const queryClient = useQueryClient();

  const realtimeStatus = useHealthCaseQueueRealtime(() => {
    void queryClient.invalidateQueries({ queryKey: ["health-case-queue"] });
    void refreshStatistics();
  });

  function handleQueryChange(value: string) {
    setRawQuery(value);
    setPage(1);
  }
  function handleFiltersChange(next: HealthCaseFilters) {
    setFilters(next);
    setPage(1);
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
      title="Health Operations Center"
      description="Receive, acknowledge, and coordinate operational medical cases affecting students in your scope."
      breadcrumb={getBreadcrumbTrail("health")}
      width="full"
      actions={
        <span className={styles.scopeIndicator}>
          {role === "super_admin" ? "All hostels" : hostelId ? "Hostel-scoped" : "Unscoped"}
        </span>
      }
    >
      <div className={styles.page}>
        <HealthStatisticsStrip statistics={statistics} loading={statsLoading} />

        <div className={styles.toolbarRow}>
          <SearchInput
            label="Search cases"
            placeholder="Search by student name or roll number"
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

        <HealthFilterBar filters={filters} onChange={handleFiltersChange} />

        <HealthCaseTable
          items={result?.items ?? []}
          loading={isLoading}
          error={error ? { message: error.userMessage } : undefined}
          emptyTitle={hasQuery ? "No cases match this search" : "No active medical cases"}
          emptyDescription={
            hasQuery
              ? "Try a different name or roll number."
              : filters.activeOnly
                ? "No active cases right now."
                : "No cases are currently on record for your hostel."
          }
        />

        {total > 0 && (
          <div className={styles.pagination} aria-live="polite">
            <span className={styles.pageInfo}>
              Page {page} of {totalPages} · {total} case{total === 1 ? "" : "s"}
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

        {realtimeStatus === "unavailable" && (
          <p className={styles.connectionNote} role="status">
            Live updates are currently unavailable — use Refresh or reopen this page to see the
            latest cases.
          </p>
        )}
      </div>
    </ContentLayout>
  );
}
