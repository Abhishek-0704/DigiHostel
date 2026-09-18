import { useEffect, useMemo, useRef, useState } from "react";
import { ContentLayout } from "../layouts/ContentLayout";
import { getBreadcrumbTrail } from "../lib/navigation/navigationConfig";
import { useAuthorization } from "../contexts/AuthorizationContext";
import { useAuditLog, useAuditStatistics } from "../features/audit";
import { useDebouncedValue } from "../hooks";
import { SearchInput } from "../components/ui";
import {
  AuditTable,
  AuditFilterBar,
  AuditDetailPanel,
  AuditStatisticsStrip,
  emptyAuditFilters,
  type AuditFilters,
} from "../components/audit";
import { Button } from "../components/ui";
import styles from "./AuditPage.module.css";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Enterprise Audit Center (Phase 5, Prompt 12), replacing Prompt 0.2's
 * "Needs a new privileged read endpoint" placeholder. A privileged,
 * staff-authorized read surface over `audit_logs` — server-side
 * pagination/filtering/sorting (mirrors `HealthPage`'s/`EmergencyPage`'s
 * established pattern), split-pane detail (mirrors `LeaveQueuePage`'s
 * established pattern). Strictly read-only throughout: no control
 * anywhere on this page mutates anything.
 *
 * No realtime subscription exists for this page, deliberately —
 * `audit_logs` is not, and per its own documented design should not
 * become, a member of the `supabase_realtime` publication (it has zero
 * client-facing RLS by design; a realtime subscription would require
 * relaxing that boundary solely for convenience, which this task's own
 * explicit instruction forbids). "Refresh" is a manual, honest
 * re-fetch — never a fabricated "Live" indicator.
 */
export default function AuditPage() {
  const { role, hostelId } = useAuthorization();
  const [rawQuery, setRawQuery] = useState("");
  const [filters, setFilters] = useState<AuditFilters>(emptyAuditFilters());
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [activeId, setActiveId] = useState<string | null>(null);

  const debouncedQuery = useDebouncedValue(rawQuery, SEARCH_DEBOUNCE_MS);

  const dateRangeError =
    filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo
      ? "The start date must not be after the end date."
      : undefined;

  const { result, isLoading, isFetching, error, refresh } = useAuditLog({
    q: debouncedQuery.trim() === "" ? undefined : debouncedQuery.trim(),
    module: filters.modules.length > 0 ? filters.modules : undefined,
    actorType: filters.actorTypes.length > 0 ? filters.actorTypes : undefined,
    dateFrom: filters.dateFrom && !dateRangeError ? `${filters.dateFrom}T00:00:00.000Z` : undefined,
    dateTo: filters.dateTo && !dateRangeError ? `${filters.dateTo}T23:59:59.999Z` : undefined,
    page,
    pageSize: PAGE_SIZE,
    sortDir,
  });
  const { statistics, isLoading: statsLoading, refresh: refreshStatistics } = useAuditStatistics();

  const layoutRef = useRef<HTMLDivElement>(null);
  const lastActiveIdRef = useRef<string | null>(null);

  const activeItem = useMemo(
    () => result?.items.find((item) => item.id === activeId) ?? null,
    [result, activeId],
  );

  useEffect(() => {
    if (activeId === null && lastActiveIdRef.current) {
      const id = lastActiveIdRef.current;
      lastActiveIdRef.current = null;
      layoutRef.current?.querySelector<HTMLElement>(`[data-audit-id="${id}"]`)?.focus();
    }
  }, [activeId]);

  function handleClose() {
    lastActiveIdRef.current = activeId;
    setActiveId(null);
  }

  function handleQueryChange(value: string) {
    setRawQuery(value);
    setPage(1);
  }
  function handleFiltersChange(next: AuditFilters) {
    setFilters(next);
    setPage(1);
  }
  function handleSortChange(value: "asc" | "desc") {
    setSortDir(value);
    setPage(1);
  }
  async function handleRefresh() {
    await Promise.all([refresh(), refreshStatistics()]);
  }

  const total = result?.total ?? 0;
  const totalPages = total === 0 ? 1 : Math.ceil(total / PAGE_SIZE);
  const hasQueryOrFilter =
    debouncedQuery.trim() !== "" ||
    filters.modules.length > 0 ||
    filters.actorTypes.length > 0 ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "";

  return (
    <ContentLayout
      title="Audit Logs"
      description="A privileged, read-only trail of actions recorded across the modules within your authorized scope."
      breadcrumb={getBreadcrumbTrail("audit")}
      width="full"
      actions={
        <div className={styles.headerActions}>
          <span className={styles.scopeIndicator}>
            {role === "super_admin" ? "All hostels" : hostelId ? "Hostel-scoped" : "Unscoped"}
          </span>
          <Button variant="secondary" onClick={() => void handleRefresh()}>
            Refresh
          </Button>
        </div>
      }
    >
      <div className={styles.page} ref={layoutRef}>
        <AuditStatisticsStrip statistics={statistics} loading={statsLoading} />

        <div className={styles.toolbarRow}>
          <SearchInput
            label="Search events"
            placeholder="Search by student name, roll number, or actor name"
            value={rawQuery}
            onChange={(e) => handleQueryChange(e.target.value)}
          />
          <label className={styles.sortLabel}>
            Sort by
            <select
              className={styles.sortSelect}
              value={sortDir}
              onChange={(e) => handleSortChange(e.target.value as "asc" | "desc")}
            >
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </label>
        </div>

        <AuditFilterBar
          filters={filters}
          onChange={handleFiltersChange}
          dateRangeError={dateRangeError}
        />

        <div
          className={[styles.layout, activeId ? styles.hasSelection : ""].filter(Boolean).join(" ")}
        >
          <div className={styles.listColumn}>
            <AuditTable
              items={result?.items ?? []}
              activeId={activeId}
              onOpen={setActiveId}
              loading={isLoading}
              error={
                error ? { message: error.userMessage, onRetry: () => void refresh() } : undefined
              }
              emptyTitle={
                hasQueryOrFilter ? "No events match these filters" : "No audit events yet"
              }
              emptyDescription={
                hasQueryOrFilter
                  ? "Try adjusting or clearing your search/filters/date range."
                  : "No recorded events exist yet within your authorized scope."
              }
            />
            {total > 0 && (
              <div className={styles.pagination} aria-live="polite">
                <span className={styles.pageInfo}>
                  Page {page} of {totalPages} · {total} event{total === 1 ? "" : "s"}
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
          <div className={styles.detailColumn}>
            <AuditDetailPanel item={activeItem} onClose={handleClose} />
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
