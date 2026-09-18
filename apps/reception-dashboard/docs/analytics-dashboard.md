# Operational Intelligence & Executive Analytics Dashboard (Phase 6, Prompt 15)

Replaces Prompt 0.2's "Future scope" `AnalyticsPage` placeholder with a real, read-only executive KPI/trend dashboard at `/analytics`. This is a **read-model/analytics layer only** — it aggregates data that already exists in other already-certified domains' own authoritative tables. It introduces no new persistent business-transaction table, no new migration, no new authorization mechanism, and it never becomes a second source of truth for leave/movement/notification state.

## 1. Reconnaissance summary

| Assumption | Status |
|---|---|
| A dedicated `/analytics` route, nav item, and placeholder page already exist | **VERIFIED** — `apps/reception-dashboard/src/pages/AnalyticsPage.tsx` (Prompt 0.2 placeholder), `routes/index.tsx`, `lib/navigation/navigationConfig.ts` all pre-wired |
| A `reports:view` permission already exists and is granted to `hostel_admin`/`super_admin` only | **VERIFIED** — `lib/authorization/permissions.ts`/`policy.ts`, unchanged since Prompt 3 — `reception_warden`/`library_incharge` were never granted it |
| `getHostelPresenceSummary()` exists, tested, unwired | **VERIFIED** — built during the Prompt 9 remediation pass, never previously called from any route |
| `hostels`/`rooms` have a capacity column | **VERIFIED FALSE** — `packages/db/src/schema/hostel.ts` has no capacity/bed-count field of any kind. True occupancy-against-capacity is architecturally **UNAVAILABLE**, not merely unbuilt. |
| `students` has a department/academic-year/category field | **VERIFIED FALSE** — `packages/db/src/schema/identity.ts`'s `students` table carries only `id`/`authUserId`/`rollNumber`/`fullName`/`hostelId`/`roomId`. No such filter was built. |
| "Current active sessions" is derivable from Force Sign-Out's `sessions_invalidated_before` | **VERIFIED FALSE** — that column is a one-way invalidation watermark (QG-04, F-QG04-02), not a session-listing system. No session-count metric was built. |
| Library/"students in library" data exists | **VERIFIED FALSE** — `qr_sessions`/`journey_events`/`library_passes` remain entirely unwired to any Fastify route (Digital Library Pass is unbuilt). No Library metric was built. |
| A charting library is already installed | **VERIFIED FALSE** — none existed. `recharts@3.10.1` was added fresh, confirmed React-19-compatible via pnpm's own peer-dependency resolution. |

## 2. Source-of-Truth / Metric Matrix

| Metric | Source table(s) | Calculation | Scope | Status |
|---|---|---|---|---|
| Total Students / Currently Inside / Currently Outside | `students`, `leave_requests`, `leave_exit_authorizations`, `movements` | `DrizzleStudentRepository.getHostelPresenceSummary()` (reused verbatim) — `exitAuthorized && !returnRecorded` on each student's own most recent leave request; point-in-time, not period-bound | Hostel-scoped / unscoped | **IMPLEMENTED** |
| Pending Now | `leave_requests` | `COUNT(status = 'pending')`, snapshot | Hostel-scoped / unscoped | **IMPLEMENTED** |
| Created in Period | `leave_requests` | `COUNT(created_at BETWEEN dateFrom AND dateTo)` | Hostel-scoped / unscoped | **IMPLEMENTED** |
| Approved / Rejected in Period | `leave_approval_events` | `COUNT(event_type='responded' AND response=<x> AND occurred_at BETWEEN ...)` — the decision event, never the leave request's current status column | Hostel-scoped / unscoped | **IMPLEMENTED** |
| Expired in Period | `leave_approval_events` | `COUNT(event_type='expired' AND occurred_at BETWEEN ...)` | Hostel-scoped / unscoped | **IMPLEMENTED** |
| Approval Rate | `leave_approval_events` | `approved / (approved + rejected)`, `null` if denominator is 0 | Hostel-scoped / unscoped | **IMPLEMENTED** |
| Avg. Parent Response Time | `leave_approval_events` (`manual_override` → `responded`) | `avg(responded.occurred_at - manual_override.occurred_at)` in minutes, over requests decided in period; `null` if none qualify | Hostel-scoped / unscoped | **IMPLEMENTED** |
| Hostel Returns in Period | `movements` | `COUNT(movement_type='hostel_return' AND occurred_at BETWEEN ...)` | Hostel-scoped / unscoped | **IMPLEMENTED** |
| Avg. Time Outside Hostel | `movements`, `leave_exit_authorizations` | `avg(movements.occurred_at - leave_exit_authorizations.authorized_at)`, joined on `leave_request_id`; `null` if no return in period has a resolvable exit row | Hostel-scoped / unscoped | **IMPLEMENTED** |
| Notifications Generated/Delivered/Failed in Period | `notifications` | Generated: `created_at` in period. Delivered: `delivered_at` in period (not `created_at`). Failed: `status='failed' AND created_at` in period | Hostel-scoped / unscoped (via `leave_requests` → `students`) | **IMPLEMENTED** (honestly near-zero for most seed data — this table has no independent producer beyond the real escalation/notification workers) |
| Leave Requests Over Time (created/approved/rejected by day) | `leave_requests`, `leave_approval_events` | Same event definitions as above, UTC-day-bucketed, zero-filled for every day with no events | Hostel-scoped / unscoped | **IMPLEMENTED** |
| Hostel Returns Over Time (by day, by hour-of-day) | `movements` | Day-bucketed and hour-of-day-bucketed (0–23) counts, both zero-filled | Hostel-scoped / unscoped | **IMPLEMENTED** |
| Hostel Occupancy (against room/bed capacity) | — | — | — | **UNAVAILABLE** — no capacity column exists anywhere in the schema (architectural gap, not a missing query) |
| Digital Library Pass activity / students currently in library | — | — | — | **FUTURE — NOT YET AVAILABLE** — Digital Library Pass backend is unbuilt |
| Administrative session-level analytics (active sessions, session duration) | — | — | — | **UNAVAILABLE** — no session-listing capability exists anywhere (QG-04 confirmed Force Sign-Out is a one-way invalidation watermark, not a session table) |
| Department / academic-year / student-category breakdowns | — | — | — | **UNAVAILABLE** — no such field exists on `students` |

Every "IMPLEMENTED" row above is computed fresh, server-side, on every request — nothing is cached, precomputed, or estimated. Every "UNAVAILABLE"/"FUTURE" row is rendered as an honest absence in the UI (a dash + reason, or an explicit deferred-metrics note), never a fabricated zero or omitted silently.

## 3. Analytics data flow

```
Reception Dashboard (AnalyticsPage)
  -> features/analytics/{useAnalyticsOverview,useLeaveTrend,useMovementTrend}
     (TanStack Query, one query key per endpoint, keyed by the shared date range)
  -> services/analytics/AnalyticsService (thin transport wrapper)
  -> generated getAnalyticsOverview()/getAnalyticsLeaveTrend()/getAnalyticsMovementTrend()
     (Orval, from packages/api-spec/openapi.yaml)
  -> Fastify GET /api/v1/analytics/{overview,leave-trend,movement-trend}
     (apps/api/src/routes/analytics.ts)
  -> AnalyticsService (apps/api/src/domain/analytics/service.ts, thin pass-through)
  -> DrizzleAnalyticsRepository (apps/api/src/domain/analytics/repository.ts)
  -> Fastify's service-role Postgres connection (bypasses RLS by design,
     ADR-006/ADR-014 — identical to every other privileged staff read in
     this codebase, e.g. Audit/Emergency/Health)
  -> leave_requests / leave_approval_events / leave_exit_authorizations /
     movements / notifications / students / staff (raw SQL aggregation,
     DB-side — no raw row ever reaches the browser)
```

No frontend code and no Supabase Realtime subscription ever reads these tables directly. The only path is through the three routes above, each requiring an authenticated AAL2 staff session with `role IN (hostel_admin, super_admin)`.

## 4. Dashboard layout

`/analytics` (`AnalyticsPage.tsx`), composed inside the existing `ContentLayout` shell:

1. Header: title, description, hostel-scope indicator ("Hostel-scoped" / "All hostels", derived from `useAuthorization().role` — no new indicator logic), manual "Refresh" button.
2. `DateRangeFilter` — one shared 7/30/90-day preset control, feeding every KPI/chart on the page from a single computed `DateRangeValue`.
3. Four `KPISection`s: **Student Presence (right now)**, **Leave**, **Movement**, **Parent/Student Notifications (Leave Escalation)** — the last explicitly labeled to avoid implying it covers the Reception Dashboard's own (non-persistent) Notification Center.
4. Two `ChartCard`-wrapped trend charts: **Leave Requests Over Time** (line chart, 3 series) and **Hostel Returns Over Time** (two bar charts — daily volume, hourly distribution).
5. A closing, always-visible note naming the three genuinely unavailable/future metric groups and why (§2 above), rather than omitting them silently.

## 5. Chart architecture

`recharts@3.10.1` (new dependency — none existed before; confirmed React 19–compatible via pnpm's peer-dependency resolution in the lockfile). Both charts share one wrapper, `ChartCard`, implementing title/description/loading-skeleton/error-with-retry/empty-state/accessible-summary/responsive-container chrome exactly once rather than duplicated per chart:

- **Leave Requests Over Time** (`LeaveTrendChart`): a `LineChart` with three distinct series — Created, Approved, Rejected — each from its own authoritative event (§2), never a single collapsed "leave activity" line. Colors: Created uses `var(--color-primary)` (the app's real design-token color, confirmed resolving correctly in a live browser — not a literal unresolved CSS-variable string), Approved `#2e7d32` (green), Rejected `#c62828` (red) — chosen for AA-contrast distinctness, never relying on color alone (each series also has a distinct legend label and line marker).
- **Hostel Returns Over Time** (`MovementTrendChart`): two `BarChart`s — daily count and hour-of-day distribution — neither a pie/donut (avoiding high-cardinality pie charts per §21), both zero-filled for empty buckets.
- Every chart computes a plain-language **accessible textual summary** (e.g. *"Over the selected period, 16 leave requests were created, 14 were approved, and 0 were rejected."*) rendered as visually-hidden (`.srOnly`, the exact pattern already established in `components/navigation/NavItem.module.css`) text in the accessibility tree, with the visual chart area marked `aria-hidden` when a summary is present — a screen-reader user gets the same information a sighted user reads off the chart's shape, not merely "a chart exists here."
- Tooltips and a legend are present on both charts (recharts' built-in `Tooltip`/`Legend`).

## 6. Filtering strategy

One shared date-range control (`features/analytics/dateRange.ts`), consumed by all three data hooks — they can never silently disagree about "the period," because they all derive from the same `DateRangeValue`:

- Presets: Last 7 / 30 / 90 days (`DATE_RANGE_PRESETS`) — 90 days matches the backend's own `MAX_ANALYTICS_RANGE_DAYS`, so the widest selectable preset is never wider than what the server will actually accept.
- Both bounds are real UTC ISO 8601 instants, `dateFrom`/`dateTo` both inclusive — "Last 7 days" is a trailing 7×24h window ending now, not a calendar-week boundary (no such concept exists anywhere else in this codebase).
- **The backend never trusts the client-computed range as authoritative.** `apps/api/src/routes/analytics.ts`'s `rangeQuerySchema` (Zod, `.strict()`) independently re-validates: both-or-neither of `dateFrom`/`dateTo`, `z.string().datetime()`, `dateFrom <= dateTo`, span `<= 90` days — malformed/half-open/inverted/too-wide ranges all get `400`. No date range param is ever supplied → the server computes its own trailing-7-day default (`defaultRange()`), never trusting an implicit client default either.
- **No department/academic-year/student-category filter was built** — `students` has no such field (§1).
- **Hostel scope is never a request parameter.** `hostel_admin`/`super_admin` are resolved entirely server-side from the authenticated caller's own staff identity (`scopeCondition()` in `repository.ts`, joined against `students.hostel_id` via `staff.id = <caller>`); no route in `routes/analytics.ts` accepts a `hostelId` query/body field at all, so there is nothing for a forged value to override. `super_admin` sees `sql\`true\`` (unscoped) — no optional narrowing filter was added for `super_admin`, since no precedent for that shape exists anywhere else in this codebase.

## 7. Realtime strategy — deliberately not built

No realtime subscription exists on `/analytics`. This directly mirrors `AuditPage.tsx`'s own established precedent and reasoning: aggregating over an arbitrary staff-selected date range has no safe, non-approximated way to update incrementally per underlying row-event. The two alternatives were both rejected as explicitly warned against by this feature's own governing instructions:

1. Recompute the whole dashboard on every leave/movement/notification event across every connected staff session — the "recompute everything on every event" anti-pattern.
2. Build a fragile client-side incremental approximation of a server-side aggregate.

"Refresh" is a manual, honest re-fetch of all three endpoints (`Promise.all` over each hook's `refresh()`), followed by a confirmation toast — never a fabricated "Live" indicator.

## 8. State management

Every KPI/chart/filter/refresh concern lives in the existing TanStack Query convention — no second store, no new state-management library. `presetId` is the one piece of local component state (`useState` in `AnalyticsPage`); everything else derives from it via `buildDateRange()` and three independent, identically-keyed `useQuery` calls (`ANALYTICS_OVERVIEW_QUERY_KEY`/`ANALYTICS_LEAVE_TREND_QUERY_KEY`/`ANALYTICS_MOVEMENT_TREND_QUERY_KEY`, each `[name, dateFrom, dateTo]`). Changing the preset changes the query key, which TanStack Query treats as a fresh fetch automatically — no manual invalidation is needed for filter changes (only "Refresh" calls `invalidateQueries` explicitly).

## 9. Security

- Full existing chain, unchanged and reused: Password → TOTP MFA → AAL2 → Staff Identity → Role (`hostel_admin`/`super_admin` only — `analyticsOnly = [app.authenticate, requireStaffRole("hostel_admin","super_admin"), requireAal2()]`) → Permission (`reports:view`, already existing, unchanged) → Hostel Scope (server-resolved, §6) → Backend Authorization → (no RLS involvement for these three routes — service-role bypass, identical to Audit/Emergency/Health).
- Every route is strictly read-only. `AnalyticsService`/`AnalyticsRepository` expose no mutation method of any kind.
- No client-supplied `staffId`/`hostelId`/`role` field has any effect on scope — always resolved server-side from `request.auth.profile`; `.strict()` schema validation rejects any attempt to smuggle an extra field (including a forged `hostelId`) with `400`.
- Cross-hostel isolation independently verified: (a) 18 route-level adversarial tests with a fake repository proving the repository always receives the AUTHENTICATED caller's own `staffId`/`staffRole`, never a client-supplied value, across every role/AAL/forged-parameter combination; (b) 7 real-Postgres integration tests, including a genuine "a Utkal hostel_admin sees none of a Kalinga-only fixture" isolation proof and a "forged/nonexistent staffId resolves to zero counts, never an unscoped global fallback" proof.
- `reception_warden`/`library_incharge` cannot reach any `/analytics/*` route at all (`403`) — verified both by the role guard and by a route test asserting it explicitly, since `reports:view` was never granted to either role.

## 10. Privacy / data minimization

Every metric on this page is a count or an average — never an individual record. Health/emergency/audit domains are explicitly out of this pass's scope (§2 lists only Presence/Leave/Movement/Notifications), so the specific "12 active health cases must never leak into 12 students' medical details" risk this prompt names does not arise here; if a future extension adds Health/Emergency analytics, it must preserve this same counts-only discipline. Notification analytics report only aggregate counts (generated/delivered/failed), never per-recipient delivery status or phone numbers.

## 11. Loading / error / empty / unavailable states

Independently handled per data source, not as one page-level flag:

- **Initial load**: each `KPISection`'s tiles and each `ChartCard` render their own `Skeleton`, driven by that source's own `isLoading` — the overview, leave-trend, and movement-trend requests load independently and render as each resolves, not gated on all three together.
- **Per-KPI unavailable** (`approvalRate`/`avgResponseMinutes` when `null`): `KPITile` renders an honest dash + reason (e.g. "No decided requests in this period"), never a fabricated `0`.
- **Chart error**: `ChartCard`'s `error` state (role="alert") with a "Try again" retry button, calling that chart's own `refresh()` — a failure in one chart never blocks the other chart or the KPI tiles.
- **Chart empty**: a distinct "No data for this period" state (`isEmpty`), never a fabricated zero-value chart.
- **Overview fetch error**: a page-level error banner (`role="alert"`) shown above the KPI sections, using the existing `AppError`/`mapAnalyticsError` taxonomy (401→unauthenticated, 403→forbidden, 400→validation) — the same error-mapping pattern already established by every other analytics-adjacent feature in this app.
- **Permission-denied** (a `reception_warden`/`library_incharge` session): the page is never reached at all — the existing `RequirePermission`/nav-gate (`reports:view`) intercepts it, identically to every other permission-gated route.
- **Realtime-disconnected**: not applicable — no realtime subscription exists on this page (§7).
- No date range with zero underlying events produces genuine, fully-computed zero counts (§2's "IMPLEMENTED" rows), rendered as a plain `0` — distinguished throughout, in code and in this document, from the `null`/unavailable states above.

## 12. Accessibility

**Code-level** (implemented, reviewed by inspection): `DateRangeFilter` is a labeled `role="group"` with `aria-pressed` on each preset button; `KPITile`'s unavailable state carries an explicit `aria-label`; `ChartCard`'s loading state is `aria-busy` with a descriptive label; every chart has a visually-hidden accessible textual summary plus `aria-hidden` on the decorative chart area (§5); color is never the sole carrier of meaning (each trend series also has a distinct legend label).

**Live assistive-technology verification: NOT PERFORMED.** No screen reader (NVDA/JAWS/VoiceOver/TalkBack) was used against the rendered page in this task. This is recorded explicitly as a gap, not implied by the code-level review above — matching this codebase's own established discipline (e.g. `apps/parent-mobile`'s F-09 finding) of never conflating the two.

## 13. Performance

**Architectural** (implemented): every KPI/trend value is computed DB-side in a small, fixed number of queries per endpoint (`getOverview()` runs its four sub-aggregates via `Promise.all`, not sequentially; `getLeaveTrend()`/`getMovementTrend()` each run a bounded number of bucketed queries) — no raw per-student/per-request row is ever pulled to the browser for client-side aggregation. The 90-day maximum range bound (§6) is a real, enforced cap against unbounded aggregation cost. No materialized view, cache, or background worker was introduced — none was demonstrated necessary by profiling, and none is documented as a future requirement beyond "if profiling ever shows otherwise."

**Measured**: query timings were observed informally during live verification (all three endpoints returned well under 1 second against the local development database) but no systematic query-plan (`EXPLAIN ANALYZE`) profiling was performed.

**Load testing: NOT PERFORMED.** No concurrent-request or sustained-load test was run against these endpoints. This is recorded explicitly, not implied by the architectural/measured notes above.

## 14. Testing

- **Backend**: `apps/api/src/routes/analytics.test.ts` (18 tests — unauthenticated/AAL1/wrong-role (`reception_warden`, `library_incharge`)/hostel_admin/super_admin success on all three routes, forged hostelId/staffId query params rejected, repository always receives the authenticated caller's own identity, default-range/malformed-date/half-open-range/inverted-range/over-90-day-range rejection, valid explicit range passed through exactly, forged extra query field rejected).
- **Backend real-Postgres integration**: `apps/api/src/domain/analytics/repository.integration.test.ts` (7 tests, `DATABASE_URL`-gated — hostel-scope isolation against real seeded fixtures, a genuine full create→startParentApproval→decide→authorizeExit→recordHostelReturn leave cycle producing non-negative/non-null durations, a forged/nonexistent staffId resolving to zero rather than an unscoped fallback, empty-period real zeros/nulls, day-bucket zero-filling, and a full-24-entry hour-bucket guarantee).
- **Frontend**: `apps/reception-dashboard/src/pages/AnalyticsPage.test.tsx` (9 tests — KPI rendering, scope indicator for both roles, loading skeletons, honest null/unavailable KPI states, error banner, shared date-range propagation to every hook, Refresh calling every data source plus the confirmation toast, chart accessible summaries, the deferred-metrics note); `apps/reception-dashboard/src/components/analytics/{KPITile,DateRangeFilter,ChartCard}.test.tsx` (13 tests — real-zero vs. loading vs. unavailable rendering, preset selection/aria-pressed, loading/error/empty/accessible-summary chart states).
- pgTAP: unchanged — no schema/RLS file was touched by this feature.
- Full workspace regression (typecheck/lint/format/build/test): see the Prompt 15 final report for the exact pass/fail counts at time of delivery.

## 15. Deferred / unavailable analytics (with reasons)

| Metric | Status | Reason |
|---|---|---|
| Hostel occupancy against room/bed capacity | UNAVAILABLE | No capacity column exists on `hostels`/`rooms` anywhere in the schema — an architectural gap, not a missing query. Presence (inside/outside counts, no capacity denominator) is shown instead and is explicitly distinct from occupancy in the UI copy. |
| Digital Library Pass activity / students currently in library | FUTURE — NOT YET AVAILABLE | The Digital Library Pass backend (`qr_sessions`/`journey_events`/`library_passes`) remains entirely unbuilt. |
| Administrative session-level analytics (active session counts, session duration) | UNAVAILABLE | No session-listing capability exists anywhere in this codebase; Force Sign-Out's `sessions_invalidated_before` (QG-04) is a one-way invalidation watermark, not a session table. |
| Department / academic-year / student-category breakdowns | UNAVAILABLE | `students` carries no such field. |
| Staff-facing Notification Center analytics (as opposed to the real parent/student `notifications` table shown here) | N/A — DIFFERENT SYSTEM | The Reception Dashboard's own Notification Center has zero persistent backing (confirmed unchanged since Prompts 6/11) — this page's "Parent/Student Notifications" section is the real, persistent `notifications` table only, explicitly labeled "(Leave Escalation)" to avoid conflating the two. |
| Export/CSV/PDF, scheduled reports, predictive/anomaly analytics | OUT OF SCOPE | Explicitly excluded by this prompt's own scope boundary (§29/§36) — reserved for a future Prompt 16 (Reports), not implemented or previewed here. |

## 16. Developer extension guidelines

To add a new KPI or trend metric to an existing domain (Leave/Movement/Notifications/Presence): add the query to the relevant method in `DrizzleAnalyticsRepository`, extend the corresponding type in `types.ts` with a doc comment naming its exact source event/table and null-semantics (matching the discipline in §2 above), extend the OpenAPI schema and regenerate, then add the tile/series in `AnalyticsPage.tsx`/the relevant chart component. To add a wholly new analytics domain (e.g. a future Emergency/Health analytics section): follow the identical pattern — a new method on the repository joined against that domain's own tables via a fresh `scopeCondition()`-style hostel join (this codebase does not share that helper centrally; each repository defines its own, matching `leave/repository.ts`'s `hostelScopedForStaff` convention) — and preserve the counts-only privacy discipline (§10) for any domain involving health/emergency/audit data. Do not add a client-supplied filter for a field that does not exist on the underlying table (§1/§6) — verify against the schema first.
