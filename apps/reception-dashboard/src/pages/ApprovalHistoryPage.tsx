import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ContentLayout } from "../layouts/ContentLayout";
import { getBreadcrumbTrail } from "../lib/navigation/navigationConfig";
import { useAuthorization } from "../contexts/AuthorizationContext";
import { useLeaveQueue } from "../features/leave";
import { isTerminalLeaveStatus, TERMINAL_LEAVE_STATUSES } from "../features/leave/types";
import { useDebouncedValue } from "../hooks";
import { LeaveRequestTable } from "../components/leave";
import { SearchInput, Button } from "../components/ui";
import { leaveDetailPath } from "../constants/routes";
import type { LeaveQueueItem } from "../features/leave/types";
import { LEAVE_STATUS_LABEL } from "../features/leave/statusPresentation";
import styles from "./ApprovalHistoryPage.module.css";

const SEARCH_DEBOUNCE_MS = 300;

type ScopeFilter = "decided" | "all";

/**
 * Approval History (Phase 5, Prompt 12), replacing Prompt 0.2's placeholder.
 *
 * Deliberately NOT a new dataset, endpoint, or state machine (§11's
 * explicit instruction: "Do NOT create a competing approval state
 * machine... The Reception Dashboard is a consumer/operator interface for
 * the resulting history"). Reconnaissance before this page was written
 * confirmed `GET /leave-requests/queue` (Phase 3, Prompt 7A,
 * `useLeaveQueue`) already returns the caller's FULL hostel-scoped set of
 * leave requests — every status, not just active ones — ordered
 * newest-first with no artificial cutoff. This page is a different VIEW
 * over that exact same, already-certified, already-hostel-scoped dataset:
 * default-filtered to decided/terminal outcomes (approved/rejected/
 * expired) rather than the Leave Queue page's operational "what needs my
 * attention now" framing, with a toggle to see everything. Selecting a row
 * navigates to the existing, already-certified Parent Approval Session
 * Workspace (`/leave/:id`, `LeaveDetailPage`) — which already renders the
 * complete, real `leave_approval_events` timeline via `SessionTimeline` —
 * rather than duplicating a second timeline renderer on this page.
 */
export default function ApprovalHistoryPage() {
  const { role, hostelId } = useAuthorization();
  const navigate = useNavigate();
  const { items, isLoading, error, refresh } = useLeaveQueue();
  const [rawQuery, setRawQuery] = useState("");
  const [scope, setScope] = useState<ScopeFilter>("decided");
  const debouncedQuery = useDebouncedValue(rawQuery, SEARCH_DEBOUNCE_MS);

  const visibleItems = useMemo(() => {
    let filtered: LeaveQueueItem[] =
      scope === "decided" ? items.filter((i) => isTerminalLeaveStatus(i.status)) : items;

    const q = debouncedQuery.trim().toLowerCase();
    if (q !== "") {
      filtered = filtered.filter(
        (i) =>
          i.studentFullName.toLowerCase().startsWith(q) ||
          i.studentRollNumber.toLowerCase().startsWith(q),
      );
    }

    return [...filtered].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }, [items, scope, debouncedQuery]);

  const decidedCount = items.filter((i) => isTerminalLeaveStatus(i.status)).length;

  return (
    <ContentLayout
      title="Approval History"
      description="Completed parent-approval outcomes for leave requests within your authorized scope."
      breadcrumb={getBreadcrumbTrail("approval-history")}
      width="full"
      actions={
        <div className={styles.headerActions}>
          <span className={styles.scopeIndicator}>
            {role === "super_admin" ? "All hostels" : hostelId ? "Hostel-scoped" : "Unscoped"}
          </span>
          <Button variant="secondary" onClick={() => void refresh()}>
            Refresh
          </Button>
        </div>
      }
    >
      <div className={styles.page}>
        <div className={styles.toolbarRow}>
          <SearchInput
            label="Search history"
            placeholder="Search by student name or roll number"
            value={rawQuery}
            onChange={(e) => setRawQuery(e.target.value)}
          />
          <div className={styles.scopeToggle} role="radiogroup" aria-label="History scope">
            <button
              type="button"
              role="radio"
              aria-checked={scope === "decided"}
              className={[styles.scopeButton, scope === "decided" ? styles.scopeButtonActive : ""]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setScope("decided")}
            >
              Decided only ({decidedCount})
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={scope === "all"}
              className={[styles.scopeButton, scope === "all" ? styles.scopeButtonActive : ""]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setScope("all")}
            >
              All requests ({items.length})
            </button>
          </div>
        </div>

        <p className={styles.decidedNote}>
          Decided outcomes: {TERMINAL_LEAVE_STATUSES.map((s) => LEAVE_STATUS_LABEL[s]).join(", ")}.
          Select a request to open its complete approval timeline.
        </p>

        <LeaveRequestTable
          items={visibleItems}
          activeId={null}
          onOpen={(id) => navigate(leaveDetailPath(id))}
          loading={isLoading}
          error={error ? { message: error.userMessage, onRetry: () => void refresh() } : undefined}
          emptyTitle={
            scope === "decided" ? "No decided requests yet" : "No leave requests in your scope"
          }
          emptyDescription={
            scope === "decided"
              ? "No requests within your scope have reached a final outcome yet."
              : "No students in your assigned scope currently have any leave request."
          }
        />
      </div>
    </ContentLayout>
  );
}
