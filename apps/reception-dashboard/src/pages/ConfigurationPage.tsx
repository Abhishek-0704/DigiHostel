import { useEffect, useMemo, useRef, useState } from "react";
import { ContentLayout } from "../layouts/ContentLayout";
import { getBreadcrumbTrail } from "../lib/navigation/navigationConfig";
import { useAuthorization } from "../contexts/AuthorizationContext";
import {
  useConfigurationList,
  useConfigurationStatistics,
  useConfigurationDomains,
  useConfigurationMutations,
  extractServerErrorMessage,
} from "../features/configuration";
import { useDebouncedValue } from "../hooks";
import { SearchInput, Button, useToast } from "../components/ui";
import {
  ConfigurationTable,
  ConfigurationFilterBar,
  ConfigurationDetailPanel,
  ConfigurationStatisticsStrip,
  CreateConfigurationDialog,
  emptyConfigurationFilters,
  type ConfigurationFilters,
} from "../components/configuration";
import styles from "./ConfigurationPage.module.css";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Enterprise Configuration Center (Phase 5, Prompt 14) — a new page/route,
 * not a replacement for an existing placeholder: reconnaissance found
 * `SettingsPage`/`SystemPage` are each reserved for a DIFFERENT, distinct
 * concept (personal account settings; future system-health monitoring —
 * see each page's own "Phase 7" doc comment), so overloading either would
 * have silently repurposed a route this project's own convention already
 * scopes to something else. This page reuses the already-granted
 * `configuration:manage` permission (`hostel_admin`/`super_admin` only,
 * granted since Prompt 3, never previously wired to a route) and mirrors
 * `UsersPage`'s established split-pane/server-side-pagination pattern
 * exactly.
 *
 * hostel_admin sees every GLOBAL entry plus only their own hostel's
 * entries, and may only create/edit within their own hostel scope — the
 * backend independently re-verifies this on every request; this page's own
 * restrictions (hiding the "Global" scope option from a hostel_admin, for
 * example) are UX guidance only.
 */
export default function ConfigurationPage() {
  const { role, hostelId } = useAuthorization();
  const { showToast } = useToast();

  const [rawQuery, setRawQuery] = useState("");
  const [filters, setFilters] = useState<ConfigurationFilters>(emptyConfigurationFilters());
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const debouncedQuery = useDebouncedValue(rawQuery, SEARCH_DEBOUNCE_MS);

  const { result, isLoading, isFetching, error, refresh } = useConfigurationList({
    domain: filters.domains.length > 0 ? filters.domains : undefined,
    scope: filters.scopes.length > 0 ? filters.scopes : undefined,
    isActive: filters.activeOnly ?? undefined,
    q: debouncedQuery.trim() === "" ? undefined : debouncedQuery.trim(),
    page,
    pageSize: PAGE_SIZE,
    sortDir,
  });
  const {
    statistics,
    isLoading: statsLoading,
    refresh: refreshStatistics,
  } = useConfigurationStatistics();
  const { domains } = useConfigurationDomains();
  const mutations = useConfigurationMutations();

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
      layoutRef.current?.querySelector<HTMLElement>(`[data-configuration-id="${id}"]`)?.focus();
    }
  }, [activeId]);

  function handleClose() {
    lastActiveIdRef.current = activeId;
    setActiveId(null);
    setDetailError(null);
  }
  function handleOpen(id: string) {
    setDetailError(null);
    setActiveId(id);
  }
  function handleQueryChange(value: string) {
    setRawQuery(value);
    setPage(1);
  }
  function handleFiltersChange(next: ConfigurationFilters) {
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

  function describeError(err: unknown): string {
    return extractServerErrorMessage(err) ?? mutations.mapError(err).userMessage;
  }

  async function handleCreate(input: Parameters<typeof mutations.create.mutateAsync>[0]) {
    setCreateError(null);
    try {
      await mutations.create.mutateAsync(input);
      showToast({ message: `"${input.key}" was created.`, variant: "success" });
      setCreateOpen(false);
    } catch (err) {
      setCreateError(describeError(err));
    }
  }

  async function handleUpdate(
    entryId: string,
    input: {
      expectedVersion: number;
      value?: unknown;
      description?: string | null;
      isActive?: boolean;
    },
  ): Promise<boolean> {
    setDetailError(null);
    try {
      await mutations.update.mutateAsync({ entryId, params: input });
      showToast({
        message: input.isActive !== undefined ? "Status updated." : "Configuration entry updated.",
        variant: "success",
      });
      return true;
    } catch (err) {
      setDetailError(describeError(err));
      return false;
    }
  }

  const total = result?.total ?? 0;
  const totalPages = total === 0 ? 1 : Math.ceil(total / PAGE_SIZE);
  const hasQueryOrFilter =
    debouncedQuery.trim() !== "" ||
    filters.domains.length > 0 ||
    filters.scopes.length > 0 ||
    filters.activeOnly !== null;

  // Only a hostel_admin/super_admin session can ever reach this page (route
  // guard) — this narrows `role` for the components below, which need to
  // know which of the two it is (never trusted as the actual security
  // boundary, only for UX).
  const actingRole = role === "super_admin" ? "super_admin" : "hostel_admin";

  // Mirrors the backend's own hostel-scope rule (never the actual
  // boundary — a hostel_admin who somehow reaches Edit/Deactivate anyway
  // still gets a real 403 from the server): a hostel_admin may act only on
  // entries scoped to their own hostel, never a global entry or another
  // hostel's.
  const canEditActiveItem =
    actingRole === "super_admin" ||
    (activeItem?.scope === "hostel" && activeItem.hostelId === hostelId);

  return (
    <ContentLayout
      title="Configuration"
      description="Centralized administration for platform, hostel, and operational configuration."
      breadcrumb={getBreadcrumbTrail("configuration")}
      width="full"
      actions={
        <div className={styles.headerActions}>
          <span className={styles.scopeIndicator}>
            {role === "super_admin" ? "All hostels" : hostelId ? "Hostel-scoped" : "Unscoped"}
          </span>
          <Button variant="secondary" onClick={() => void handleRefresh()}>
            Refresh
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setCreateError(null);
              setCreateOpen(true);
            }}
          >
            Create Entry
          </Button>
        </div>
      }
    >
      <div className={styles.page} ref={layoutRef}>
        <ConfigurationStatisticsStrip statistics={statistics} loading={statsLoading} />

        <div className={styles.toolbarRow}>
          <SearchInput
            label="Search configuration"
            placeholder="Search by key or domain"
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
              <option value="desc">Recently updated first</option>
              <option value="asc">Least recently updated first</option>
            </select>
          </label>
        </div>

        <ConfigurationFilterBar filters={filters} onChange={handleFiltersChange} />

        <div
          className={[styles.layout, activeId ? styles.hasSelection : ""].filter(Boolean).join(" ")}
        >
          <div className={styles.listColumn}>
            <ConfigurationTable
              items={result?.items ?? []}
              activeId={activeId}
              onOpen={handleOpen}
              loading={isLoading}
              error={
                error ? { message: error.userMessage, onRetry: () => void refresh() } : undefined
              }
              emptyTitle={
                hasQueryOrFilter
                  ? "No configuration entries match these filters"
                  : "No configuration entries yet"
              }
              emptyDescription={
                hasQueryOrFilter
                  ? "Try adjusting or clearing your search/filters."
                  : "Create the first configuration entry to get started."
              }
            />
            {total > 0 && (
              <div className={styles.pagination} aria-live="polite">
                <span className={styles.pageInfo}>
                  Page {page} of {totalPages} · {total} entr{total === 1 ? "y" : "ies"}
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
            <ConfigurationDetailPanel
              entry={activeItem}
              canEdit={canEditActiveItem}
              onClose={handleClose}
              onUpdate={handleUpdate}
              errorMessage={detailError}
              clearError={() => setDetailError(null)}
              busy={mutations.update.isPending}
            />
          </div>
        </div>
      </div>

      <CreateConfigurationDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        domains={domains}
        actingRole={actingRole}
        actingHostelId={hostelId}
        onValidate={(input) => mutations.validate.mutateAsync(input)}
        onSubmit={handleCreate}
        submitting={mutations.create.isPending}
        errorMessage={createError}
      />
    </ContentLayout>
  );
}
