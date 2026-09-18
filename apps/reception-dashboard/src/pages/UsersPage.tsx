import { useEffect, useMemo, useRef, useState } from "react";
import { ContentLayout } from "../layouts/ContentLayout";
import { getBreadcrumbTrail } from "../lib/navigation/navigationConfig";
import { useAuthorization } from "../contexts/AuthorizationContext";
import {
  useStaffDirectory,
  useStaffStatistics,
  useActingStaffId,
  useStaffMutations,
  extractServerErrorMessage,
} from "../features/staff";
import { useDebouncedValue } from "../hooks";
import { SearchInput, Button, useToast } from "../components/ui";
import {
  StaffTable,
  StaffFilterBar,
  StaffDetailPanel,
  StaffStatisticsStrip,
  CreateStaffDialog,
  emptyStaffFilters,
  type StaffFilters,
} from "../components/staff";
import type { StaffAdminRole, StaffAdminStatus } from "@digihostel/api-client-react";
import styles from "./UsersPage.module.css";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Identity & Access Administration Center (Phase 5, Prompt 13), replacing
 * Prompt 0.2's "super_admin only, once a staff-provisioning endpoint
 * exists" placeholder. A privileged, super_admin-only staff directory and
 * account-lifecycle management surface — server-side pagination/filtering/
 * sorting (mirrors `AuditPage`'s/`HealthPage`'s established pattern),
 * split-pane detail (mirrors `LeaveQueuePage`'s established pattern).
 *
 * Every mutation (role/hostel/status change, password reset, force
 * sign-out, account creation) is a real call into the backend's
 * `requireSuperAdmin()`-gated `/staff` route family — this page performs no
 * authorization of its own beyond hiding the "Create Staff Account" control
 * for a non-super_admin (the route itself, and this page's own
 * `withPermission("users:manage", ...)` route guard, are the real
 * boundary). Role/hostel/status changes never accept a hostel *name* —
 * there is no hostel-listing capability anywhere in this application
 * (`StaffIdentity.tsx`'s own long-established, unchanged reasoning);
 * hostel assignment is a plain UUID field throughout.
 *
 * No realtime subscription exists for this page, deliberately — `staff` is
 * not a member of the `supabase_realtime` publication and adding one for a
 * super_admin-only administrative console was judged unnecessary scope;
 * "Refresh" is a manual, honest re-fetch.
 */
export default function UsersPage() {
  const { role, hostelId, can } = useAuthorization();
  const { showToast } = useToast();

  const [rawQuery, setRawQuery] = useState("");
  const [filters, setFilters] = useState<StaffFilters>(emptyStaffFilters());
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const debouncedQuery = useDebouncedValue(rawQuery, SEARCH_DEBOUNCE_MS);

  const { result, isLoading, isFetching, error, refresh } = useStaffDirectory({
    q: debouncedQuery.trim() === "" ? undefined : debouncedQuery.trim(),
    role: filters.roles.length > 0 ? filters.roles : undefined,
    status: filters.statuses.length > 0 ? filters.statuses : undefined,
    page,
    pageSize: PAGE_SIZE,
    sortDir,
  });
  const { statistics, isLoading: statsLoading, refresh: refreshStatistics } = useStaffStatistics();
  const actingStaffId = useActingStaffId();
  const mutations = useStaffMutations();

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
      layoutRef.current?.querySelector<HTMLElement>(`[data-staff-id="${id}"]`)?.focus();
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
  function handleFiltersChange(next: StaffFilters) {
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

  async function handleCreate(input: {
    fullName: string;
    email: string;
    role: StaffAdminRole;
    hostelId: string | null;
  }) {
    setCreateError(null);
    try {
      await mutations.create.mutateAsync(input);
      showToast({ message: `${input.fullName} was invited as ${input.role}.`, variant: "success" });
      setCreateOpen(false);
    } catch (err) {
      setCreateError(describeError(err));
    }
  }

  async function handleChangeRole(staffId: string, role: StaffAdminRole): Promise<boolean> {
    setDetailError(null);
    try {
      await mutations.changeRole.mutateAsync({ staffId, role });
      showToast({ message: "Role updated.", variant: "success" });
      return true;
    } catch (err) {
      setDetailError(describeError(err));
      return false;
    }
  }

  async function handleChangeHostel(staffId: string, hostelId: string | null): Promise<boolean> {
    setDetailError(null);
    try {
      await mutations.changeHostel.mutateAsync({ staffId, hostelId });
      showToast({ message: "Hostel assignment updated.", variant: "success" });
      return true;
    } catch (err) {
      setDetailError(describeError(err));
      return false;
    }
  }

  async function handleChangeStatus(staffId: string, status: StaffAdminStatus): Promise<boolean> {
    setDetailError(null);
    try {
      await mutations.changeStatus.mutateAsync({ staffId, status });
      showToast({
        message: status === "suspended" ? "Staff account suspended." : "Staff account reactivated.",
        variant: "success",
      });
      return true;
    } catch (err) {
      setDetailError(describeError(err));
      return false;
    }
  }

  async function handleResetPassword(staffId: string): Promise<boolean> {
    setDetailError(null);
    try {
      await mutations.resetPassword.mutateAsync(staffId);
      showToast({ message: "Password-reset email sent.", variant: "success" });
      return true;
    } catch (err) {
      setDetailError(describeError(err));
      return false;
    }
  }

  async function handleForceSignOut(staffId: string): Promise<boolean> {
    setDetailError(null);
    try {
      await mutations.forceSignOut.mutateAsync(staffId);
      showToast({ message: "Every active session was revoked.", variant: "success" });
      return true;
    } catch (err) {
      setDetailError(describeError(err));
      return false;
    }
  }

  const total = result?.total ?? 0;
  const totalPages = total === 0 ? 1 : Math.ceil(total / PAGE_SIZE);
  const hasQueryOrFilter =
    debouncedQuery.trim() !== "" || filters.roles.length > 0 || filters.statuses.length > 0;
  const busy =
    mutations.changeRole.isPending ||
    mutations.changeHostel.isPending ||
    mutations.changeStatus.isPending ||
    mutations.resetPassword.isPending ||
    mutations.forceSignOut.isPending;

  return (
    <ContentLayout
      title="Users &amp; Access"
      description="Provision staff accounts and manage role, hostel assignment, and session lifecycle across the system."
      breadcrumb={getBreadcrumbTrail("users")}
      width="full"
      actions={
        <div className={styles.headerActions}>
          <span className={styles.scopeIndicator}>
            {role === "super_admin" ? "All hostels" : hostelId ? "Hostel-scoped" : "Unscoped"}
          </span>
          <Button variant="secondary" onClick={() => void handleRefresh()}>
            Refresh
          </Button>
          {can("users:manage") && (
            <Button
              variant="primary"
              onClick={() => {
                setCreateError(null);
                setCreateOpen(true);
              }}
            >
              Create Staff Account
            </Button>
          )}
        </div>
      }
    >
      <div className={styles.page} ref={layoutRef}>
        <StaffStatisticsStrip statistics={statistics} loading={statsLoading} />

        <div className={styles.toolbarRow}>
          <SearchInput
            label="Search staff"
            placeholder="Search by name or email"
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

        <StaffFilterBar filters={filters} onChange={handleFiltersChange} />

        <div
          className={[styles.layout, activeId ? styles.hasSelection : ""].filter(Boolean).join(" ")}
        >
          <div className={styles.listColumn}>
            <StaffTable
              items={result?.items ?? []}
              activeId={activeId}
              onOpen={handleOpen}
              loading={isLoading}
              error={
                error ? { message: error.userMessage, onRetry: () => void refresh() } : undefined
              }
              emptyTitle={
                hasQueryOrFilter ? "No staff match these filters" : "No staff accounts yet"
              }
              emptyDescription={
                hasQueryOrFilter
                  ? "Try adjusting or clearing your search/filters."
                  : "Create the first staff account to get started."
              }
            />
            {total > 0 && (
              <div className={styles.pagination} aria-live="polite">
                <span className={styles.pageInfo}>
                  Page {page} of {totalPages} · {total} staff member{total === 1 ? "" : "s"}
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
            <StaffDetailPanel
              staff={activeItem}
              actingStaffId={actingStaffId}
              onClose={handleClose}
              onChangeRole={handleChangeRole}
              onChangeHostel={handleChangeHostel}
              onChangeStatus={handleChangeStatus}
              onResetPassword={handleResetPassword}
              onForceSignOut={handleForceSignOut}
              errorMessage={detailError}
              clearError={() => setDetailError(null)}
              busy={busy}
            />
          </div>
        </div>
      </div>

      <CreateStaffDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
        submitting={mutations.create.isPending}
        errorMessage={createError}
      />
    </ContentLayout>
  );
}
