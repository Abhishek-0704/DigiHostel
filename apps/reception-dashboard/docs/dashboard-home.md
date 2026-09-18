# Dashboard Home (Phase 2, Prompt 5)

This document records what Prompt 5 actually built: the operational command center displayed at `/dashboard` after successful staff login. It assumes [`dashboard-shell.md`](dashboard-shell.md) (Prompt 4) as the permanent shell this page mounts into — layout hierarchy, navigation, routing, breadcrumbs, the `ContentLayout` page-template primitive, error boundaries, and the toast layer are all reused unchanged here, not rebuilt.

**Update (Prompt 6, Notification Center)**: the "Active Notifications" metric described below as `future` is now genuinely `real` — it reads the canonical `unreadCount` from `NotificationContext` (currently, honestly, `0`). See [`notification-center.md`](notification-center.md) for the full Notification Center architecture.

**Update (Phase 3, Prompt 7A, Reception Leave Request Queue)**: the "Pending Parent Approvals" metric described below remains exactly as this document originally classified it — this prompt built the Leave Queue's own summary (a genuinely `real`, derived count, scoped to the real staff queue endpoint) as part of the Leave Queue page itself, not as a change to this page's own metric. Wiring Dashboard Home's own "Pending Parent Approvals" card to the same new endpoint was considered (the identical placeholder→real transition already performed for "Active Notifications" above) but deliberately left for a follow-up pass, since it touches this page's own file, not the Leave Queue's — recorded here as an explicit, low-risk, ready-to-do dependency rather than silently left stale. See [`leave-queue.md`](leave-queue.md) for the new endpoint this future wiring would consume.

## 1. Dashboard architecture summary

`DashboardHomePage` (`src/pages/DashboardHomePage.tsx`) is a thin composition root: it renders Prompt 4's `ContentLayout` (title "Dashboard", breadcrumb from the existing centralized navigation model, a `DashboardRefreshControl` as its `actions`) and, inside it, the widgets from `src/components/dashboard/`. All business/view-model logic lives in `src/features/dashboard/` — the page itself owns only layout and the two pieces of state genuinely shared across widgets: the manual-refresh `generation`/`lastUpdatedAt` pair (`useDashboardRefresh`) and a single realtime-connection probe reading (`useRealtimeConnectionProbe`), both obtained once at the page level and passed down as props to `SystemHealthPanel` and `LiveStatusBar` so the two widgets share one socket subscription instead of opening two.

```
DashboardHomePage
└── ContentLayout (Prompt 4)
    ├── WelcomeSection
    ├── LiveStatusBar
    ├── OperationalSummary → MetricCard × N
    ├── QuickActions → QuickActionCard × N
    ├── PendingWorkPanel → TaskItem × N
    ├── ActivityFeed → ActivityItem × N
    ├── SystemHealthPanel → SystemHealthCard × N
    └── AnnouncementsPanel → AnnouncementCard × N
```

No business-module logic was implemented — every page a Quick Action or metric links to is still Prompt 4's `PagePlaceholder`. No new authentication mechanism, RBAC system, permission, or database change was introduced.

## 2. Widget inventory

| Widget | File | Responsibility |
|---|---|---|
| `WelcomeSection` | `components/dashboard/WelcomeSection.tsx` | Greeting, staff name/role/hostel-scope, current date/time |
| `MetricCard` | `components/dashboard/MetricCard.tsx` | One operational-summary metric — real value or honest unavailable reason |
| `OperationalSummary` | `components/dashboard/OperationalSummary.tsx` | Permission-filtered grid of `MetricCard`s |
| `QuickActionCard` / `QuickActions` | `components/dashboard/QuickAction*.tsx` | Permission-filtered navigation shortcuts |
| `TaskItem` / `PendingWorkPanel` | `components/dashboard/{TaskItem,PendingWorkPanel}.tsx` | Prioritized work items, honest empty state today |
| `ActivityItem` / `ActivityFeed` | `components/dashboard/{ActivityItem,ActivityFeed}.tsx` | Chronological operational events, honest empty state today |
| `AnnouncementCard` / `AnnouncementsPanel` | `components/dashboard/{AnnouncementCard,AnnouncementsPanel}.tsx` | Hostel/administrative notices, honest empty state today |
| `SystemHealthCard` / `SystemHealthPanel` | `components/dashboard/{SystemHealthCard,SystemHealthPanel}.tsx` | Per-service health rows, never a fabricated "all green" |
| `LiveStatusBar` | `components/dashboard/LiveStatusBar.tsx` | Compact connectivity + realtime + last-refreshed strip |
| `DashboardRefreshControl` | `components/dashboard/DashboardRefreshControl.tsx` | Manual refresh trigger + toast confirmation |

No component was created merely because a prompt section named it — `WidgetSkeleton`/`WidgetError`/`WidgetEmptyState` from the prompt's suggested inventory are not separate components; `LoadingIndicator`/`ErrorState`/`EmptyState` (Prompt 0.2) are reused as-is everywhere a widget needs one, exactly as `ContentLayout` already reuses them for the page level.

## 3. Data availability — the REAL/PARTIAL/PLACEHOLDER/FUTURE classification

This is the load-bearing section. Every widget's data source was verified by direct inspection (reading `apps/api/src/routes/leave.ts`, every `services/*/​*Service.ts` interface's own doc comment, and `packages/db/src/schema/*.ts`'s RLS policies) — nothing below is assumed from a service's filename alone.

| Widget / metric | Classification | Evidence |
|---|---|---|
| Staff identity (name, role, hostel scope) | **REAL** | `AuthorizationContext` → `staffProfileService.getMyStaffProfile()` — unchanged from Prompt 3/4 |
| Current date/time | **REAL** | `useCurrentDateTime` (real `Date`, shared with `HeaderClock`) |
| Authentication status | **REAL** | `AuthContext.status` — the page cannot render unless it's `"authenticated"` |
| Realtime connectivity | **REAL** (connection only) / **PARTIAL** (no business channel) | `useRealtimeConnectionProbe` genuinely observes the Supabase Realtime socket; no `postgres_changes` listener is attached to any table |
| Browser online/offline | **REAL** | `useOnlineStatus`, `navigator.onLine` |
| Pending Parent Approvals | **PLACEHOLDER** | `apps/api/src/routes/leave.ts`'s `GET /leave-requests` returns `403 role_required` for any caller that isn't `student`/`parent` — a reception session cannot read this today. `LeaveService.ts`'s own doc comment defers ALL leave-domain wiring to Phase 3 (Prompt 7A/7B). RLS's `leave_requests_all_reception` policy *would* technically permit a direct Supabase read — this was deliberately NOT done; see §9 below |
| Students Awaiting Verification | **PLACEHOLDER** | `StudentService.ts` interface-only, deferred to Phase 4 (Prompt 8) |
| Emergency Alerts | **FUTURE** | `EmergencyService.ts` interface-only; zero Fastify route surface over `security_incidents` |
| Health Alerts | **FUTURE** | `HealthService.ts` interface-only; no data model beyond the SDD module name |
| Active Notifications | **REAL** (Prompt 6 update — see below) | Now composed in `useOperationalSummary` from `NotificationContext.unreadCount`, the same canonical count the Header badge reads; honestly `0` since no notification producer exists yet |
| Pending Work items | **PLACEHOLDER** | Same evidence as Pending Parent Approvals — no leave/verification data source reachable today |
| Recent Activity events | **FUTURE** | `AuditService.ts` interface-only (`audit_logs` has zero client-facing RLS by design, Phase 5/Prompt 12); every other candidate event source is equally unavailable |
| Announcements | **FUTURE** | No announcement service or database table exists anywhere in this repository |
| System Health — Authentication | **REAL** | `AuthContext.status` |
| System Health — Realtime | **REAL** (connection only) | Same probe as the Live Status Bar |
| System Health — Notification Service | **FUTURE** | Same as Active Notifications |
| System Health — SAP Integration | **FUTURE** | Confirmed by repository-wide inspection: no scraping mechanism exists anywhere in this codebase |
| System Health — Background Jobs | **FUTURE** | `apps/api`'s pg-boss workers are real, but expose no status endpoint this browser app can read |

No metric anywhere on this page renders a fabricated number. Every placeholder/future state names, in plain language, what is missing and (where applicable) which phase owns it.

## 4. The one deliberately-declined data pathway

`leave_requests_all_reception` (`packages/db/src/schema/identity.ts`'s sibling schema file for leave) is a real RLS policy that would let a `reception_warden`'s own Supabase session directly `SELECT` `leave_requests` for their hostel, entirely bypassing Fastify. This prompt did **not** build a direct Supabase read for the Pending Parent Approvals/Pending Work metrics on top of that policy, even though it is technically available, for three convergent reasons:

1. `LeaveService.ts`'s own doc comment (written during Prompt 0.2) already designates leave-domain data wiring as Phase 3's (Prompt 7A/7B) responsibility, not Phase 2's.
2. This app's own established convention — `staffProfileService`'s doc comment states explicitly "no business table is read anywhere in this app" — would have been broken for the first time by this prompt, a genuinely new architectural precedent that a five-word metric card does not warrant setting unilaterally.
3. This prompt's own §38 gives the exact "Pending Parent Approvals → metric/placeholder → Open Leave Queue" pattern as correct, and explicitly warns against a dashboard absorbing a future module's data-fetching responsibility.

**This is recorded as an open question for whoever implements Phase 3**: should the Leave Queue's real data arrive via a new Fastify staff-scoped listing endpoint (matching `docs/reception-dashboard-architecture.md` §13's original plan) or via a direct RLS-scoped Supabase read (matching what `leave_requests_all_reception` already permits)? Not resolved here.

## 5. Quick Actions

| Action | Route | Permission | Notes |
|---|---|---|---|
| Open Leave Queue | `/leave` | `leave:queue:view` | |
| Search Student | `/students` | `student:search` | Also the entry point into student verification — see below |
| Emergency Response | `/emergency` | `emergency:manage` | |
| Health Alerts | `/health` | `health:manage` | |
| Reports | `/reports` | `reports:view` | |

Two of the prompt's own suggested actions were deliberately **not** built:

- **Verify Student** — `/students/:rollNumber/verification` is parameterized; there is no generic destination to navigate to without already knowing which student. This mirrors `lib/navigation/navigationConfig.ts`'s own Prompt 4 decision to exclude the identical route from the sidebar for the identical reason. "Search Student" is the correct dashboard-level entry point into that flow.
- **Announcements** — no `ROUTES.announcements` (or any announcement page) exists in this router; inventing a destination for it would fabricate a route.

Every Quick Action is filtered through `useAuthorization().hasPermission` — the exact same function every route guard and the sidebar already use (`getVisibleQuickActions`, `features/dashboard/quickActions.ts`). No new permission was created; no client-controlled role check exists anywhere in this feature.

## 6. Pending Work / Activity / Announcements architecture

Each of these three panels is backed by its own small hook (`usePendingWork`, `useActivityFeed`, `useAnnouncements`) rather than an inline empty state, specifically so a future prompt only has to change the hook's *implementation* — `PendingWorkPanel`/`ActivityFeed`/`AnnouncementsPanel` and their row components (`TaskItem`/`ActivityItem`/`AnnouncementCard`) already render whatever `items` they're given, including full priority/timestamp/navigation handling. The item shapes (`TaskItemData`, `ActivityItemData`, `AnnouncementData` in `features/dashboard/types.ts`) are defined now so that future work only supplies data, not a redesign.

## 7. System Health architecture

`useSystemHealth(realtimeState)` (`features/dashboard/useSystemHealth.ts`) is a pure presentation layer over signals this app can already observe — it does not implement, and must not be confused with, the future System Health *module* (a distinct, later roadmap item). See §3's table above for the per-row evidence. The realtime row's status vocabulary (`operational`/`degraded`/`unavailable`/`unknown`) is deliberately non-binary: a socket that errors is shown as "Degraded," not silently reported as either fully healthy or fully down.

## 8. Dashboard state summary

- **Local UI state**: none of significance — no widget has its own expand/collapse state in this pass.
- **Query/server state**: `useDashboardRefresh` registers the `["dashboard"]` TanStack Query key namespace and calls `queryClient.invalidateQueries` against it on refresh — a genuine no-op today (no widget has a real query registered under that key yet, since every current widget's data is either static, derived from context, or realtime-probed), but it is the real, working convention a future query-backed widget will be invalidated by without inventing its own refresh wiring.
- **Realtime state**: `useRealtimeConnectionProbe` (built on Prompt 0.2's generic `useRealtimeChannel` lifecycle hook, with an empty `configure` callback — no business-table listener) is read once per page and shared by `SystemHealthPanel` and `LiveStatusBar`.
- **Global shell state**: authentication, sidebar, toast, and connectivity are all reused unchanged from Prompt 4 — no shadow copies.

## 9. Loading, error, and refresh strategy

Because almost every widget's data is either static (operational summary, quick actions), derived synchronously from an already-resolved context (welcome section, system health's authentication row), or a fast local socket probe (realtime), there is no meaningful "initial dashboard loading" spinner to show beyond `AuthorizationContext`'s own existing loading gate (which already blocks the whole shell, per Prompt 3/4). Where a genuine wait exists — the realtime probe's `"idle"`/`"subscribing"` states — it is shown honestly as "Connecting…", not glossed over.

Manual refresh (`DashboardRefreshControl`) intentionally has no `isRefreshing` spinner: neither of its two real effects (query-namespace invalidation, realtime-channel remount) has an awaitable result worth spinning on, and inventing a fake loading window would contradict this page's own "no fabricated states" principle. A toast confirms the action instead.

No widget can currently fail in a way that produces a scary error (nothing performs a real network fetch that can reject) — the "partial failure" requirement is satisfied structurally: every empty/future state is per-widget and does not affect its siblings, and the one component that CAN genuinely error (the realtime probe) degrades to "Degraded"/"Disconnected" in place, in that one row only, without taking down the rest of the page.

## 10. Accessibility

Single `<h1>` (from `ContentLayout`'s own title, "Dashboard") — the welcome greeting is a labelled, non-heading paragraph rather than a second, competing `<h1>`. Every section (`OperationalSummary`, `QuickActions`, and each `Card`-based panel) has its own `<h2>`. Metric cards and Quick Action cards that carry a real navigation target are genuine `<button>`s with a combined accessible name (label + reason/description) rather than icon-only or ambiguous controls; a metric with no destination stays a plain, non-interactive surface. System Health status is always paired with `StatusBadge`'s existing icon+text pattern (never color alone). Verified directly in a real browser (see §12) with the actual rendered DOM, not merely asserted in unit tests.

## 11. Performance

- Every widget's render is driven by plain props/context, not a subscription that fires more often than its underlying signal changes.
- The realtime probe is shared (one channel) between `SystemHealthPanel` and `LiveStatusBar` rather than opened twice — an explicit fix made during implementation after first drafting them as two independent probes.
- `HeaderClock` and `WelcomeSection` share one 60-second-interval clock (`useCurrentDateTime`) instead of running two independent `setInterval`s.
- `DashboardHomePage` is already lazy-loaded at the route level (Prompt 4, unchanged) — the production build confirms it as its own ~14.6 kB chunk, separate from the main bundle.
- No polling was introduced anywhere.

## 12. Testing summary

299 new/updated reception-dashboard tests were added across 17 new test files (hooks, widgets, view-model hooks, and one page-level integration test), all passing alongside the pre-existing suite. See the Prompt 5 final report for the exact, current pass/fail counts across the full workspace, typecheck, lint, format, and build. Live browser validation was performed against a real running local Supabase instance through a genuine password + TOTP sign-in (see the final report's Testing Summary section for the full evidence trail) — not merely asserted.

## 13. Developer integration guide — adding real data later

To replace a placeholder/future widget with real data once its owning phase is ready:

1. Change only the relevant hook in `features/dashboard/` (e.g. `usePendingWork`) to call a real query/service instead of returning a static/empty result — no widget component needs to change, since they already render whatever shape the hook returns.
2. If the new data is query-backed, register it under a query key that includes (or is namespaced under) `DASHBOARD_QUERY_KEY_NAMESPACE` (`features/dashboard/useDashboardRefresh.ts`) so the existing manual refresh control invalidates it automatically.
3. If the new data needs a live update, subscribe through `useRealtimeChannel` (never re-implement channel lifecycle by hand) and invalidate the relevant query on change — never merge a realtime payload directly into UI state, matching this app's own established F-08 precedent (`docs/current-state.md`).
4. Never bypass `AuthorizationContext.hasPermission` for a metric's or Quick Action's visibility — filter exactly the way `OperationalSummary`/`QuickActions` already do.
5. Keep the REAL/PARTIAL/PLACEHOLDER/FUTURE classification in §3 of this document up to date as data sources come online.
