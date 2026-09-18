import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ContentLayout } from "../layouts/ContentLayout";
import { getBreadcrumbTrail } from "../lib/navigation/navigationConfig";
import { useAuthorization } from "../contexts/AuthorizationContext";
import { useEmergencyQueue, useEmergencyStatistics } from "../features/emergency";
import { useDebouncedValue, useEmergencyQueueRealtime } from "../hooks";
import { SearchInput, Button } from "../components/ui";
import {
  EmergencyFilterBar,
  EmergencyQueueTable,
  EmergencyStatisticsStrip,
  emptyEmergencyFilters,
  type EmergencyFilters,
} from "../components/emergency";
import styles from "./EmergencyPage.module.css";

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
 * Emergency Operations Center — Queue (Phase 4, Prompt 10), replacing
 * Prompt 0.2's "Blocked — security_incidents has RLS but zero API surface"
 * placeholder. Composes the existing `ContentLayout` shell exactly like
 * every certified page since Prompt 4. Server-side pagination/filtering/
 * sorting (mirrors `StudentsPage`'s established pattern, NOT the Leave
 * Queue's client-side-filtered pattern — this dataset can genuinely grow
 * large over time, per this task's own explicit "do not filter a large
 * table entirely in the browser" instruction). Realtime-driven
 * invalidation via `useEmergencyQueueRealtime` keeps the queue live without
 * polling.
 *
 * Incident creation is deliberately NOT duplicated here — "Report
 * Emergency" is a real quick action on the Student Operations Center's
 * profile page (StudentProfilePage.tsx), which already has a genuine
 * student-search/identification flow; building a second one on this page
 * would be exactly the "second search system" this task's own instruction
 * forbids.
 */
export default function EmergencyPage() {
  const { role, hostelId } = useAuthorization();
  const [rawQuery, setRawQuery] = useState("");
  const [filters, setFilters] = useState<EmergencyFilters>(emptyEmergencyFilters());
  const [sort, setSort] = useState<SortOption>("reportedAt-desc");
  const [page, setPage] = useState(1);

  const debouncedQuery = useDebouncedValue(rawQuery, SEARCH_DEBOUNCE_MS);
  const [sortBy, sortDir] = sort.split("-") as ["reportedAt" | "severity", "asc" | "desc"];

  const { result, isLoading, isFetching, error } = useEmergencyQueue({
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
  } = useEmergencyStatistics();
  const queryClient = useQueryClient();

  const realtimeStatus = useEmergencyQueueRealtime(() => {
    void queryClient.invalidateQueries({ queryKey: ["emergency-queue"] });
    void refreshStatistics();
  });

  function handleQueryChange(value: string) {
    setRawQuery(value);
    setPage(1);
  }
  function handleFiltersChange(next: EmergencyFilters) {
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
      title="Emergency Operations Center"
      description="Receive, acknowledge, and respond to emergency incidents affecting students in your scope."
      breadcrumb={getBreadcrumbTrail("emergency")}
      width="full"
      actions={
        <span className={styles.scopeIndicator}>
          {role === "super_admin" ? "All hostels" : hostelId ? "Hostel-scoped" : "Unscoped"}
        </span>
      }
    >
      <div className={styles.page}>
        <EmergencyStatisticsStrip statistics={statistics} loading={statsLoading} />

        <div className={styles.toolbarRow}>
          <SearchInput
            label="Search incidents"
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

        <EmergencyFilterBar filters={filters} onChange={handleFiltersChange} />

        <EmergencyQueueTable
          items={result?.items ?? []}
          loading={isLoading}
          error={error ? { message: error.userMessage } : undefined}
          emptyTitle={hasQuery ? "No incidents match this search" : "No incidents in your scope"}
          emptyDescription={
            hasQuery
              ? "Try a different name or roll number."
              : filters.activeOnly
                ? "No active incidents right now."
                : "No incidents are currently on record for your hostel."
          }
        />

        {total > 0 && (
          <div className={styles.pagination} aria-live="polite">
            <span className={styles.pageInfo}>
              Page {page} of {totalPages} · {total} incident{total === 1 ? "" : "s"}
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
            latest incidents.
          </p>
        )}
      </div>
    </ContentLayout>
  );
}
