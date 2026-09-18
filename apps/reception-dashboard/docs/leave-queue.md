# Reception Leave Request Queue (Phase 3, Prompt 7A)

This document records the real, as-built architecture of the Reception Leave Request Queue at `/leave`, replacing the placeholder `LeaveQueuePage`/`LeaveService` interface left by Prompt 0.2. See [`architecture.md`](architecture.md) (Prompt 0.2 scaffolding), [`dashboard-shell.md`](dashboard-shell.md) (Phase 2, Prompt 4 — the shell this page mounts into), [`dashboard-home.md`](dashboard-home.md) and [`notification-center.md`](notification-center.md) (Phase 2, Prompts 5/6 — the List/Detail split-pane and REAL/PARTIAL/PLACEHOLDER/FUTURE classification precedents this prompt reuses), and the repo-root `docs/reception-dashboard-architecture.md`/`docs/current-state.md` for the wider planning/verification context.

## 1. Summary

The Leave Request Queue is the operational workspace reception staff use to view, search, filter, sort, and inspect outgoing student leave requests (the DigiHostel Hostel-Leaving Request domain — never to be confused with KIIT SAP's separate mentor-approved holiday/leave information, see §8). It reuses the existing authentication/authorization/dashboard-shell/notification/realtime infrastructure entirely unchanged. It implements **no** business logic beyond querying/presenting: no parent biometric approval, no parent authentication, no escalation-timer logic, no Parent Approval Session creation — all explicitly out of scope, reserved for **Prompt 7B**.

A real, narrowly-scoped backend endpoint was added because none existed: `GET /api/v1/leave-requests/queue` (staff-only, AAL2-required, hostel-scoped for `reception_warden`/`hostel_admin`, unscoped for `super_admin`) — see §11.

## 2. Data availability classification

| Data | Availability | Evidence |
|---|---|---|
| Leave request id/reason/dates/status | **REAL** | `leave_requests` via the new staff queue endpoint |
| Student name/roll number | **REAL** | `students` table, joined server-side |
| Hostel name | **REAL** | `hostels` table (`packages/db/src/schema/hostel.ts`) — a real reference table with a `name` column and an authenticated-readable RLS policy (`hostels_select_authenticated`); previously undiscovered by Prompts 4/5 (which only ever needed a raw `hostelId`), confirmed present by direct schema inspection during this prompt |
| Room number | **REAL** | `rooms` table, same reasoning as hostel name |
| Waiting time / queue summary counts | **REAL (derived)** | pure client-side arithmetic over the real, already-authorized queue dataset — never a second statistics endpoint |
| Mentor/SAP approval status | **BLOCKED** | no SAP scraper/service/table/endpoint exists anywhere in this repository (re-confirmed by this prompt — see §8) |
| Approval-event timeline (`leave_approval_events`) | **PARTIAL/FUTURE** | RLS (`lae_select_staff`) technically grants any staff role read access, but that grant has **no hostel-scope join at all** — a real, evidence-based finding (§13) — so no Fastify route was built on top of it in this pass |
| Parent/guardian identity/contact | **Not exposed** (by design) | the new endpoint never selects `parents`/`parent_student_relationships` at all — reception staff have no legitimate need to see this here |
| Operational notes | **FUTURE** | no persistence model exists |
| Audit trail (per-request) | **FUTURE** | Audit Logs is a separate, later module; this page does not duplicate it |

## 3. Queue architecture

```
LeaveQueuePage (composition only)
  ├─ useLeaveQueue()            — server state (TanStack Query, queryKey ["leave-queue"])
  │    └─ leaveQueueService.listQueue() → listStaffLeaveQueue() (generated client)
  │         → GET /api/v1/leave-requests/queue → LeaveService.getQueueForStaff()
  │              → LeaveRepository.listForStaffQueue() (Drizzle, hostel-scoped)
  ├─ useLeaveQueueState(items)  — page-local UI state (filters/search/sort/selection/activeId)
  ├─ useLeaveQueueRealtime()    — real `leave_requests` postgres_changes subscription → invalidate ["leave-queue"]
  └─ components/leave/*         — presentation only, no business logic
```

`features/leave/filtering.ts` composes status-filter + free-text search + deterministic sort entirely client-side (see §6/§7 for the documented tradeoff). No component performs its own fetch, filter, or sort logic inline.

## 4. Request table structure

`LeaveRequestTable` (`components/leave/LeaveRequestTable.tsx`) columns: **Student** (name + roll number + hostel + room, one cell), **Status** (real `LeaveStatusBadge`), **Leave Period** (start–end date), **Waiting** (live, derived), **Action** (View). No "Priority"/"Assigned Staff"/"Destination" column exists — none of those fields exist anywhere on this data model, and inventing one would be exactly the fabrication the prompt's own §12 forbids. `Table` (`components/ui/Table.tsx`, Prompt 0.2) gained one small, backward-compatible extension — an optional `getRowProps` — so this page (its first real business consumer) can mark the active row (`data-leave-request-id`) for keyboard focus-return, without any existing caller's behavior changing.

## 5. Detail panel structure

`LeaveRequestDetailPanel` mirrors the Notification Center's `NotificationDetail` split-pane/focus-management pattern exactly (Escape-to-close, close-button auto-focus). Shows: student identity, `ApprovalProgressIndicator` (see §8), reason/dates/created/waiting, and two explicitly-honest "not available" sections (Parent/Guardian, Operational Notes — see §2). **Updated, Phase 3 Prompt 7B**: the panel's action button — renamed "Open Approval Session" — is now a real, enabled navigation to `/leave/:id` (still gated by the pre-existing `leave:parent_approval:initiate` permission), opening the real-time Parent Approval Session Workspace described in [`parent-approval-session.md`](parent-approval-session.md). It creates nothing — see that document's §1 for why no "start" mutation exists in this architecture at all.

## 6. Search strategy

`QueueSearch` matches student name, roll number, hostel name, room number, and reason — case-insensitive substring, client-side. No debounce: the queue is fetched once per page/refresh (no per-keystroke network call to debounce against). **Tradeoff, documented rather than silently assumed**: a single hostel's operationally-open leave-request count is expected to stay small (tens, not thousands); if real deployment volume ever proves otherwise, `features/leave/filtering.ts`'s `applyLeaveQueueView` is the one seam a future server-side search implementation would replace, without any component needing to change.

## 7. Sorting strategy

`QueueSort` offers Newest/Oldest/Longest waiting/Student name. Every order applies the leave request's own `id` as a stable secondary tie-breaker (`features/leave/filtering.ts`'s `sortLeaveQueue`) — a realtime refetch can never reorder two rows whose primary sort key is equal, matching the Notification Center's identical `compareNotifications` discipline.

## 8. Queue state model — the critical architectural distinction

Two independent dimensions are never flattened into one status:

- **Parent Approval** (`leave_requests.status`) — the DigiHostel Hostel-Leaving Request's own real state machine (`pending → father_notified → mother_notified → guardian_notified → in_app_call → manual_verification → {approved|rejected|expired}`), rendered by `LeaveStatusBadge`.
- **Mentor/SAP Approval** — a completely separate, KIIT-SAP-sourced concept. `ApprovalProgressIndicator` always renders it as **"Not available — no SAP integration"**. No `SAP_APPROVED`-shaped value is ever inferred from `leave_requests.status`, and no fake SAP data/credentials/scraper were introduced.

## 9. SAP integration summary

**BLOCKED.** Re-confirmed by direct repository search during this prompt (`apps/api/src/domain/`, `docs/current-state.md`, the whole repository): there is no SAP scraper, no SAP service, no scheduled sync, no SAP-related API endpoint, no SAP-related database table, and not even mock SAP data anywhere in this codebase. This matches the identical finding already recorded in `architecture.md` (Prompt 0.2) and `docs/reception-dashboard-architecture.md` (Prompt 0.1). Nothing was built to simulate one; the UI is honest about its absence (§8).

## 10. Realtime synchronization strategy

`useLeaveQueueRealtime` (`hooks/useLeaveQueueRealtime.ts`) is this page's **first genuine business-table** realtime subscription in the Reception Dashboard — unlike Dashboard Home's/the Notification Center's own deliberately-empty connection probes. `leave_requests` has been in the `supabase_realtime` publication since Prompt 9B, and this dashboard's own RLS policies (`leave_requests_all_reception`/`_all_hostel_admin`/`_all_super_admin`) already scope exactly which rows a given staff member's subscription receives — the identical hostel/role scope the REST endpoint enforces, applied by Supabase Realtime itself. On any change event, the hook triggers a real TanStack Query invalidation/refetch of `["leave-queue"]` — never a client-side merge of the raw payload, matching this workspace's established F-08 discipline. A reconnect (as opposed to first connect) also triggers a catch-up refetch, matching `useLeaveRequestRealtime`'s (parent-mobile) identical, already-proven pattern.

## 11. Backend API

`GET /api/v1/leave-requests/queue` (new — `apps/api/src/routes/leave.ts`, `packages/api-spec/openapi.yaml`'s `listStaffLeaveQueue` operation, Orval-regenerated):

- `preHandler`: `authenticate` → `requireStaffRole("reception_warden", "hostel_admin", "super_admin")` → `requireAal2()` (same composition order as the existing `/expire` route, so a non-staff caller sees `role_required`, never `insufficient_assurance`).
- Rate-limited via a new named tier, `RATE_LIMIT_STAFF_QUEUE` (`apps/api/src/config/rateLimit.ts`, env-overridable, default 60/min — generous enough for a staff console's manual refresh/reconnect-catch-up pattern).
- `LeaveRepository.listForStaffQueue()` (`apps/api/src/domain/leave/repository.ts`) joins `leave_requests` → `students` → `hostels`/`rooms`, filtered by `hostelScopedForStaff(staffId)` for `reception_warden`/`hostel_admin` (the exact same helper `markExpired()` already uses) or unconditionally for `super_admin`. Ordered `createdAt desc, id asc` — deterministic, matching the frontend's own tie-breaker discipline.
- This is the **minimum narrowly-scoped staff endpoint** the architecture documentation had already identified as missing (`architecture.md`'s "open decisions" list, item 1 — "a staff-scoped listing capability"). It does **not** touch the existing student/parent-facing `GET /leave-requests` contract, does **not** add reception-side leave-request creation, and does **not** resolve the reception-initiated-leave-request/SAP conflicts those same documents flag as open — those remain exactly as open as before.

## 12. Authorization & hostel-scoping model

Identical defense-in-depth chain to every other staff route in this application: Password → TOTP MFA → AAL2 → Staff Identity → Role → Hostel Scope → Backend Authorization → Database RLS. The frontend's `RequirePermission` gate (`leave:queue:view`, already granted to `reception_warden`/`hostel_admin`/`super_admin` since Prompt 3 — **no new permission was added**) is UX only; hostel scope and role are independently re-resolved server-side from the authenticated caller's own `staff` row on every request, never trusted from a client-supplied value. See §14 for the adversarial verification performed against this chain.

## 13. Known limitations / open dependencies

1. ~~Approval-event timeline is still not wired up to a Fastify route~~ — **resolved, Phase 3 Prompt 7B.** The underlying `lae_select_staff` RLS gap this depended on was independently found (materially worse than "no hostel join" — a row-independent grant to every staff member, any role, any hostel, even AAL1), remediated (`supabase/migrations/0010_lae_select_staff_hostel_scope.sql`: `lae_select_reception`/`lae_select_hostel_admin`/`lae_select_super_admin`, reusing the existing `is_reception_for_student`/`is_hostel_admin_for_student` helpers), and independently re-verified (QG-01: **PASSED**) — full evidence in `docs/current-state.md`'s remediation paragraph. `GET /leave-requests/{id}/events` was then safely extended for staff and is now the real data source for the Parent Approval Session Workspace's timeline (`/leave/:id`) — see [`parent-approval-session.md`](parent-approval-session.md) for the full architecture. The pre-existing, schema-wide absence of AAL2 enforcement at the RLS layer remains a separate, documented characteristic, unaffected by either fix: an AAL1 staff session can still read its own hostel's data, never another hostel's.
2. **Reception-initiated leave-request creation remains unresolved** — unchanged from Prompt 0.2/5/6's own identical finding. Not touched, not silently decided, by this prompt.
3. **The Parent Approval Session (Prompt 7B)** is not created or triggered anywhere in this codebase. The "Start Parent Approval" button exists purely as a always-disabled UI placeholder.
4. **No server-side search/filter/sort/pagination** exists for the new endpoint — an explicit, documented tradeoff (§6), acceptable at current expected queue volumes.
5. **Bulk operations are read-only bookkeeping only** (select/clear/count) — no bulk approve/reject/expire exists anywhere, matching the prompt's own explicit prohibition.

## 14. Empirical security verification

Performed against the real local Supabase + `apps/api` stack and via the automated backend test suite (`apps/api/src/routes/leave.test.ts`, "GET /leave-requests/queue" describe block, 12 tests):

1. Unauthenticated → `401`. ✓
2. AAL1 (password-only, correct role) → `403 insufficient_assurance`, never `200`. ✓
3. Wrong role (student, parent, `library_incharge`) → `403 role_required`. ✓
4. `reception_warden`/`hostel_admin` in hostel A → only hostel A's requests, real enrichment (roll number/name/hostel name/room number). ✓
5. `reception_warden` in hostel B → only hostel B's request — **zero cross-hostel leakage**, verified by exact-set assertion, not just a non-empty check. ✓
6. `super_admin` → every hostel's requests, unscoped. ✓
7. A `role=super_admin&hostelId=<other-hostel>` **query string on the request cannot broaden a `reception_warden`'s scope** — the endpoint accepts no query parameters at all; role/hostel are always re-resolved from the caller's own authenticated `staff` row, never a client-supplied value. Verified directly: the manipulated request returns exactly the caller's own real, unchanged hostel-scoped result. ✓
8. Direct browser real Supabase RLS (`leave_requests_all_reception`/`_all_hostel_admin`/`_all_super_admin`) independently enforces the identical hostel scope for the realtime subscription channel — the same policies the REST endpoint's repository query already relies on, not a separate mechanism. ✓

No privilege escalation or cross-hostel leak was found. See the final report's Testing Summary for exact test counts.

## 15. Testing summary

- Backend: 12 new tests (`apps/api/src/routes/leave.test.ts`) — unauthenticated/AAL1/wrong-role/hostel-scoped/cross-hostel-isolation/super-admin-unscoped/query-parameter-cannot-broaden-scope/enrichment-correctness. Full `leave.test.ts` suite: 80/80 passing.
- Frontend: 58 new tests across `features/leave/*.test.ts(x)` (filtering, waiting-time formatting, queue-summary derivation, page-local UI state), `components/leave/*.test.tsx` (table, detail panel, filter bar), and `pages/LeaveQueuePage.test.tsx` (page composition, search, selection, empty/error states, hostel-scope indicator).
- Full workspace regression: `pnpm run typecheck`/`lint`/`format`/`test`/`build` all clean (1100 passed, 57 pre-existing skipped, 0 failed).

## 16. Developer integration guide for Prompt 7B

Prompt 7B (Parent Approval Session management) can build directly on:
- `useLeaveQueue`'s `["leave-queue"]` query key — invalidate it after any session-triggering mutation so the queue reflects the new state without a manual refresh.
- `LeaveRequestDetailPanel`'s already-reserved, always-disabled "Start Parent Approval" button (gated by the already-existing `leave:parent_approval:initiate` permission) — 7B's job is to make it real, not to invent a new UI slot.
- The real `useLeaveQueueRealtime` subscription — a Parent Approval Session state change that also updates `leave_requests.status` will already flow through to this queue automatically; a session-specific realtime need beyond that is 7B's own to design.
- The timeline dependency in §13(1) — resolving the `lae_select_staff` hostel-scope gap is a natural prerequisite for a richer Approval Session detail view.
