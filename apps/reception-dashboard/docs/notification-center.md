# Notification Center (Phase 2, Prompt 6)

This document covers Phase 2, Prompt 6's deliverable: the Enterprise Notification Center — the centralized presentation and state-management layer through which operational notifications will eventually be surfaced, once a real business-module producer exists. It builds on [`dashboard-shell.md`](dashboard-shell.md) (Prompt 4, the permanent shell) and [`dashboard-home.md`](dashboard-home.md) (Prompt 5, whose "Active Notifications" metric and Header unread badge this prompt makes genuinely real).

**Update (Phase 3, Prompt 7A, Reception Leave Request Queue)**: this document's §5 recorded a direct realtime+RLS-scoped read of `leave_requests`/`leave_approval_events` as the architecture's own intended future real notification source, deliberately not wired here. Prompt 7A did not wire it either (a Notification Center producer over leave-domain events is a distinct question from the Leave Queue's own direct, list-shaped read of the same table) — this remains an explicit open question for whoever eventually builds that producer, unaffected by the Leave Queue's own, separate, real `leave_requests` realtime subscription (see [`leave-queue.md`](leave-queue.md) §10).

## 1. Notification architecture summary

```
NotificationCard / NotificationList / NotificationDetail / filter+search+sort UI
                              ↓
        useNotificationCenterState (page-local: filters, search, sort, selection, open detail)
                              ↓
        useNotificationCenter (NotificationContext — canonical: notifications[], unreadCount)
                              ↓
                  notificationService.list() (TanStack Query)
                              ↓
                  Existing Supabase/API infrastructure (currently: nothing real to read)
```

`NotificationContext` (`src/contexts/NotificationContext.tsx`) is the ONE canonical client-side source of notification state — the Header's unread badge, Dashboard Home's "Active Notifications" metric, and the Notification Center page itself all read from it. No consumer computes its own count.

`features/notifications/` holds every framework-agnostic piece (domain types, category/priority/lifecycle metadata, filter/search/sort/merge pure functions, the page-local UI-state hook) so the filtering/sorting/deduplication logic is unit-testable without rendering React. `components/notifications/` holds the presentation layer, reusing Prompt 0.2/4's shared `Card`/`Button`/`StatusBadge`/`EmptyState`/`ErrorState`/`Skeleton`/`SearchInput` primitives rather than duplicating them.

## 2. Data availability — the REAL/PARTIAL/PLACEHOLDER/FUTURE classification

| Capability | Classification | Evidence |
|---|---|---|
| Notification Center infrastructure (list/detail/filter/search/sort/selection/lifecycle UI) | **REAL** | Built, tested, rendered against a real running app in this session |
| Canonical unread count / notification state (`NotificationContext`) | **REAL** (as infrastructure) / honestly **zero** (as data) | A genuine `useQuery`-backed context; it resolves to `[]` today because no producer exists — the `0` shown everywhere is a real fact, not a placeholder |
| Realtime connection readiness | **REAL** (connection) / **PARTIAL** (no business event source attached) | Built on Prompt 0.2's generic `useRealtimeChannel`; the probe genuinely proves the socket connects, but no `postgres_changes` listener is attached to any table |
| Actual notification content (Parent Approval / Emergency / Health / Announcement / etc.) | **FUTURE** | See §5 below for the full evidence trail — no real producer exists anywhere in this repository |
| Lifecycle mutations (mark read / acknowledge / dismiss / archive) | **PLACEHOLDER** (implemented as local-only state) | See §6 |

No production-looking notification (e.g. "Parent approved leave for Rahul") is fabricated anywhere in this codebase — every notification shown anywhere outside a test file is real. Test fixtures live only inside `*.test.ts(x)` files.

## 3. Notification lifecycle

| State | Meaning | Status today |
|---|---|---|
| `unread` | Not yet viewed | Conceptual — no real notification has ever existed to be unread |
| `read` | Viewed | Same |
| `acknowledged` | Explicitly acknowledged by staff | Same |
| `action_required` | Still needs operational action | Same |
| `completed` | Associated work is done | Same |
| `expired` | No longer actionable due to time | Same |
| `dismissed` | Staff intentionally removed it from active attention | Same |
| `archived` | Retained for history | Same |

Every transition (`markAsRead`/`acknowledge`/`dismiss`/`archive`/`markAllAsRead`, `NotificationContext.tsx`) is a **client-local presentation-state mutation**, not a backend-persisted one — there is no backend to persist to (see §5/§6). This is a deliberate, documented choice (Prompt 6 §10's explicit allowance for lifecycle simulation isolated to presentation state), not an oversight: no UI action anywhere claims a success that didn't happen (§41) — there is simply no "success/failure" distinction to fake, because these mutations only ever touch this browser's own in-memory state.

## 4. Category & priority model

11 categories (`parent_approval`, `student_verification`, `student_return`, `student_exit`, `emergency`, `health`, `system`, `administrative`, `security`, `announcement`, `audit`) and 5 priorities (`critical`, `high`, `medium`, `low`, `informational`), each with a label + accessible tone in `features/notifications/{categories,priorities}.ts`. Extensible by construction: a new category needs one new union member plus one new metadata entry — `NotificationCard`/`NotificationCategoryBadge`/`NotificationFilterBar` need no changes. Priority reuses `StatusBadge`'s existing tone vocabulary (never a new color system); Critical (error tone) and High (warning tone) remain visually and textually distinct without either overwhelming the interface.

## 5. Why no real notification event source was wired up

Two candidate real data sources were inspected and both were deliberately NOT used:

1. **The `notifications` database table** (`packages/db/src/schema/notification.ts`). RLS (`docs/rls-policy-matrix.md`) grants reception staff (any role) **zero** SELECT access — only `super_admin` can read it, explicitly labeled "support/debugging" access, not an operational feed. Even where technically readable, its rows are parent/student push-delivery-tracking records for leave escalation (`stage`, `status: queued/sent/delivered/failed`, `retryCount`) — not staff-facing work items in the sense this Notification Center models.
2. **Direct realtime + RLS-scoped queries over `leave_requests`/`leave_approval_events`** — the architecture `docs/reception-dashboard-architecture.md` §19 actually names as the intended future real source ("live dashboard panels over operational tables... not a consumer of the existing notification pipeline"). RLS (`leave_requests_all_reception`, `lae_select_staff`) genuinely permits this today. It was still not wired up here, for the same reasoning [`dashboard-home.md`](dashboard-home.md) §4 already recorded for Dashboard Home's identical "Pending Parent Approvals" metric: synthesizing a real "Parent Approval requires attention" notification (which stage means what, how to phrase/prioritize it) requires genuine Leave Management domain knowledge that belongs to Phase 3's Leave Queue implementation — and this prompt's own §47/§52 explicitly frame event *production* as a future business module's job, with the Notification Center as the consumer, never the producer.

**This is an explicit open question for whoever builds Leave Management (or any future business module)**: should it PUSH notification-shaped events into `NotificationContext`'s query layer (the cleanest fit for the `Future Business Module → Authoritative Event → Notification Infrastructure` arrow this prompt's own closing diagram describes), or should the Notification Center instead PULL by subscribing to `leave_requests`/`leave_approval_events` directly? Not resolved by this prompt.

## 6. Realtime integration summary

- **What exists**: Prompt 0.2's generic `useRealtimeChannel` lifecycle hook (subscribe-on-mount, cleanup-on-unmount, connection-state reporting) and Prompt 5's `useRealtimeConnectionProbe` built on it — reused here unchanged, with a fresh probe instance for the Notification Center page (safe: this page and Dashboard Home are mutually exclusive routes, never mounted simultaneously, so this is not a duplicate subscription in practice).
- **What is connected**: nothing business-specific — the probe proves the Supabase Realtime socket itself can connect (shown honestly as "Live"/"Connecting…"/"Reconnecting…"/"Disconnected" in the page header), never a business-table subscription.
- **What is prepared, not built**: `features/notifications/notificationMerge.ts`'s `mergeIncomingNotification` — a real, unit-tested deduplication/ordering function ready for a future realtime adapter to call. It deduplicates strictly by the notification's own stable `id` (never `title + timestamp`, per §24's explicit rule), and a genuinely new notification with a shared title/timestamp is correctly NOT collapsed into an existing one (tested).
- **Ordering**: `compareNotifications` sorts newest-`createdAt`-first with `id` as a stable secondary tie-breaker — deterministic regardless of arrival order, tested for both dimensions.
- **Reconnection**: the existing `useRealtimeChannel` state machine (`idle`→`subscribing`→`subscribed`/`error`/`closed`) is the only reconnection signal available; there is no missed-event replay mechanism (no realtime channel is actually subscribed to a table, so there is nothing to replay from) — this limitation is explicit, not glossed over.
- **Offline**: `LiveStatusBar`/`ConnectivityStatus` (Prompt 4/5, reused unchanged) already distinguish browser-offline from realtime-disconnected; the Notification Center never claims "all notifications are synchronized" — its empty state names the actual, honest reason (no source connected yet) rather than implying a sync guarantee that cannot be verified.

## 7. Filtering & search strategy

`features/notifications/filtering.ts`'s `matchesFilters`/`matchesSearch`/`sortByOrder` are pure, framework-agnostic functions — `NotificationFilterBar`/`NotificationSearch`/`NotificationSort` never fetch data themselves, only report user intent upward to `useNotificationCenterState`, which applies the pure functions to derive `visibleNotifications`. Search is a plain in-memory substring match over `title`/`message`/`source` (never metadata) with no debounce, since every current dataset is local/in-memory — debouncing an operation with no asynchronous boundary would be pure overhead. `dateRange`/`sources` are modeled in `NotificationFilters` (Prompt 6 §17's full six-dimension conceptual model) but have no dedicated UI control in this pass — there is no real data yet for either to meaningfully narrow. A future server-side search/filter implementation replaces `filtering.ts`'s function bodies; no caller (`NotificationsPage`, the filter/search/sort components) needs to change.

## 8. State management

- **Canonical/server state**: `NotificationContext` — `notifications[]`, `unreadCount`, `isLoading`, `error`, backed by TanStack Query under the `["notifications"]` key.
- **Page-local UI state**: `useNotificationCenterState` — filters, search query, sort order, selection set, the currently-open detail id. Deliberately NOT global (§28 — "do not automatically place all of this into a global store"): no other page needs any of it.
- **Derived state**: `visibleNotifications` (filtered+searched+sorted), `unreadCount`, selected count — computed via `useMemo`, never duplicated into a second piece of state that could drift from its source.
- **Realtime state**: the page-local `useRealtimeConnectionProbe` reading, shown in the page header only.

## 9. Loading & error strategy

`NotificationList` reuses `Skeleton`/`ErrorState`/`EmptyState` (Prompt 0.2) rather than duplicating them. Three distinct empty states are used, matching §31's required distinctions: "You're all caught up" (genuinely zero notifications, honestly explaining the source isn't connected yet — never "all synchronized," which cannot be verified), "No notifications match these filters" (real data exists but the current filter/search excludes all of it), and an `ErrorState` with a real retry action wired to `refresh()` (query refetch) for a genuine load failure. Manual refresh (`Refresh` button) delegates to `NotificationContext.refresh()`, which calls the same real TanStack Query `refetch()` every other refresh mechanism in this app uses.

## 10. Accessibility

Priority/category badges reuse `StatusBadge`'s icon+text pattern (never color alone). The unread indicator pairs a decorative dot with a separate, non-nested visually-hidden "Unread" text node (a nested `aria-hidden` wrapping visible text would have hidden both — caught and fixed during implementation). Selection checkboxes carry a full accessible name (`"Select notification: {title}"`) distinct from the row's own "open detail" button, so neither control's purpose is ambiguous. The detail panel is a labelled `role="region"`, closes on Escape from anywhere inside it (mirroring `ProfileMenu`'s established pattern), and moves focus to its own Close button when a new notification opens; closing it returns focus to the exact list row that opened it (via a `data-notification-id` lookup), never letting focus fall back to the document body. Verified directly in a real running browser session (keyboard-driven filter-chip toggle, tab order through search/sort/filters/list), not merely asserted in component tests.

## 11. Performance

The realtime probe is a single instance per page (not duplicated across Dashboard Home and the Notification Center, since the two routes are mutually exclusive). Filtering/sorting/searching run as plain array operations over an in-memory list — appropriate for the current (always-empty) dataset size; no virtualization was added, matching §36's explicit "do not introduce virtualization prematurely if current datasets are small." `NotificationsPage` is lazy-loaded at the route level (Prompt 4's existing convention, unchanged) and confirmed as its own separate production-build chunk.

## 12. Developer integration guide — adding a real notification producer later

1. Give the new producer a way to write into `NotificationContext`'s query layer — either change `notificationService.list()` to call a real endpoint/query, or (for realtime) call `mergeIncomingNotification` from a new, business-table-specific realtime adapter and push the result into the context's local state.
2. Supply real `Notification` objects matching `features/notifications/types.ts`'s shape — reuse an existing category if one fits (§8's category list), or add exactly one new category + metadata entry (§4) if it doesn't.
3. Never bypass `AuthorizationContext.hasPermission` for a notification action's visibility, and never let notification payload data determine permissions, role, or hostel scope (§22/§33) — `NotificationAction.requiredPermission` is a UI convenience only; the destination route's own guard remains authoritative.
4. Keep §2's data-availability table in this document up to date as capabilities move from FUTURE to REAL.
