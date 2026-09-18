# Reception Dashboard — Shell & Navigation Framework (Prompt 4)

This document covers Phase 2, Prompt 4's deliverable: the permanent enterprise application shell — header, sidebar, navigation model, routing foundation, breadcrumbs, page templates, loading/error infrastructure, and the accessibility/responsive/performance foundation every future Reception Dashboard module builds on. It extends [`architecture.md`](architecture.md) (the Prompt 0.2 scaffolding this shell replaces), [`authentication.md`](authentication.md), and [`authorization.md`](authorization.md) (both unchanged, consumed as-is). See [`dashboard-home.md`](dashboard-home.md) (Phase 2, Prompt 5) for the first real page built on top of this shell — the Dashboard Home operational command center — [`notification-center.md`](notification-center.md) (Phase 2, Prompt 6) for the Enterprise Notification Center, which also makes the Header's `NotificationIndicator` badge (mentioned below) genuinely real, and [`leave-queue.md`](leave-queue.md) (Phase 3, Prompt 7A) for the first real business-module page — the Reception Leave Request Queue — which also extended the shell's `Table` primitive with an optional per-row `getRowProps` (backward-compatible; no other page's usage changed).

**No business module was implemented.** Every page a user can reach still renders `PagePlaceholder`/`ContentLayout` with no real data — this prompt built the frame those modules will be hung on, not the modules themselves.

## Layout hierarchy

```
AppProviders (ErrorBoundary → QueryClient → Session → Auth → Authorization → Theme → Toast)
 └── RouterProvider
      ├── AuthenticationLayout            /login only — unchanged from Prompt 2
      └── RequireAuth                     unchanged from Prompt 1/3 — auth+AAL2 boundary
           └── DashboardLayout            NEW/rebuilt this prompt — the permanent shell
                ├── SkipLink              "Skip to main content" → #main-content
                ├── Sidebar (nav)         permission-aware, collapsible, grouped
                ├── Header (banner)       brand, identity, profile, status
                ├── SessionTimeoutWarning  unchanged from Prompt 2
                ├── main#main-content      ← pathless route with errorElement, RequirePermission-gated children
                │    └── ContentLayout     the page-template primitive (breadcrumb/title/actions/content)
                └── Footer (contentinfo)  version + copyright
```

Every arrow above is a real, currently-wired relationship — this is not aspirational. `RequireAuth`, `AuthContext`, `AuthorizationContext`, `RequireRole`/`RequirePermission` are **unchanged** by this prompt (Prompt 1/3's own security boundary, reused, not duplicated, not weakened — see `docs/authentication.md`/`authorization.md`).

## Navigation architecture

`src/lib/navigation/navigationConfig.ts` is the single source of truth: a static, strongly-typed `NAVIGATION_ITEMS` array (`id`, `label`, `route`, `icon`, `requiredPermission?`, `group?`) plus `NAVIGATION_GROUPS` and `UNGATED_NAVIGATION_ITEMS` (Settings/Help — unchanged from Prompt 0.2/3's "personal-account/universal pages aren't permission-gated" convention). Every `route`/`requiredPermission` value references the **already-existing** `ROUTES`/`Permission` constants — nothing here invented a route or a permission.

**Deliberately excludes two real routes**: `ROUTES.leaveDetail` (`/leave/:id`) and `ROUTES.studentVerification` (`/students/:rollNumber/verification`). Both are parameterized and reached contextually (from a Leave Queue row, from a Student Profile page) — never as a standalone sidebar destination. A primary-navigation item needs a concrete target; "go verify some unspecified student" isn't one.

`src/lib/navigation/useVisibleNavigation.ts` is the **one** place `NAVIGATION_ITEMS` gets filtered by permission — it defers entirely to `useAuthorization().hasPermission`, the exact function `RequirePermission` (route guards) already uses. `Sidebar.tsx` consumes this hook and nothing else; it does not maintain its own visibility logic.

### Adding a new navigation item (developer guide)

1. Add the route to `constants/routes.ts` (if it doesn't exist).
2. Add the permission to `lib/authorization/permissions.ts`'s `PERMISSIONS` array and grant it to the appropriate role(s) in `lib/authorization/policy.ts`'s `ROLE_PERMISSIONS` — **only if the permission doesn't already exist**. Do not invent a permission for a module that has no accepted grant yet; document the dependency instead (see "Open dependencies" below).
3. Add one entry to `NAVIGATION_ITEMS` in `navigationConfig.ts`, with a `group` only if 2+ items genuinely share one.
4. Wire the route in `routes/index.tsx` with `withPermission(...)`.

Nothing else needs to change — `Sidebar`, breadcrumbs, and route protection all read from the same two sources (`navigationConfig.ts`, `RequirePermission`).

## Sidebar organization

Structure, top to bottom: ungrouped single-item categories (Dashboard, Notifications, Students, Emergency, Health Alerts) → grouped sections with an `<h3>` heading (**Leave Management**: Leave Queue, Approval History; **Reports**: Reports, Analytics; **Administration**: Audit Logs, Users, System Health) → a divider → always-visible Settings/Help & Support → a `SidebarCollapseButton`.

A category becomes a *group* only once it holds 2+ items — a 1-item group would add a heading that organizes nothing (a real information-architecture decision, not an oversight; `navigationConfig.ts`'s own comment explains it).

**Collapsed state**: icon-only, 64px rail. Every `NavItem`'s label is **never removed from the DOM** — it becomes visually-hidden text (`.srOnly`) plus a native `title` attribute, so the link keeps a real accessible name and a hover tooltip. The scaffolding's prior collapsed behavior (`label={collapsed ? "" : item.label}`) left links with **no accessible name at all** when collapsed — a real defect this prompt found and fixed, not merely a visual change.

**Active state**: `NavLink`'s own `aria-current="page"` (never a hand-computed "isActive" class) plus a left-border accent and bold weight — never color alone.

**Persistence**: `state/sidebarState.ts` now persists the collapsed preference to `localStorage` (new this prompt — Prompt 0.2's own foundation deliberately deferred this pending "a real 'operators expect this to survive a reload' requirement," which a reception desk used by the same operator across a shift satisfies). Fails silently back to the in-memory default if storage is unavailable (private browsing, a blocked-storage policy) — never throws, never breaks the shell.

## Header architecture

Left: menu toggle (`aria-label="Toggle navigation"`, shared with the sidebar's own collapse button — one handler, not two competing toggles) + "Reception Dashboard" brand text.

Right, in order: a **genuinely disabled** search placeholder (`aria-label="Search (coming soon)"` — no fake functionality behind it, §7's explicit rule); `ConnectivityStatus` (real `navigator.onLine`, not invented sync/session data); `HeaderClock` (real, locale-formatted, updates once a minute); `NotificationIndicator` linking to the **already-real** `/notifications` route (shown only when the caller holds `notifications:view` — the identical permission check the route itself enforces); `StaffIdentity` (name + `RoleBadge` + a hostel-scope indicator — see below); `ProfileMenu`.

**Staff identity, not a second source**: `StaffIdentity`/`ProfileMenu` both read `AuthorizationContext`'s `role`/`staffName` (the latter is new this prompt — an additive field on the existing context, reusing the exact staff-profile fetch that already existed, not a new identity fetch) and `SessionContext`'s `session.user.email`. No new Supabase query was added.

**Hostel scope — an honest limitation, not a fabrication**: this app has no hostel-name lookup service (`hostels` is a business table Prompt 4 correctly does not query — building a lookup would be a business API, explicitly out of scope). `StaffIdentity` shows "Hostel-scoped" vs. "All hostels," derived from whether `hostelId` is non-null — real, already-available data — rather than inventing or guessing a hostel name. A future module that adds a real lookup can upgrade this without changing the component's contract.

**Profile menu**: a labeled popup (not a spec-complete ARIA `menu`/`menuitem` widget implying arrow-key/Home/End/typeahead navigation this component doesn't implement) containing the same identity block, Settings/Help links, and Sign out — reusing `AuthContext.signOut()` unchanged, not a second logout mechanism. Closes on outside click, on Escape (returning focus to the trigger button), and on selecting an item; focuses the first interactive element on open.

## Routing & protection

Unchanged security model: `RequireAuth` (auth+AAL2) wraps `DashboardLayout`; each leaf route is wrapped in `RequirePermission` exactly as Prompt 3 established. **New this prompt**: an intermediate pathless route (`element: <Outlet/>`) sits between `DashboardLayout` and the 17 leaf routes, carrying `RouteErrorBoundary` as its `errorElement`. This is deliberate placement, not arbitrary nesting — React Router replaces everything from the nearest ancestor *with* an `errorElement` downward on a route error; putting it directly on `DashboardLayout`'s own route would tear down the sidebar/header on every route-level error. Nesting one level in means a thrown error only ever replaces what's inside the `<Outlet/>` — the shell chrome stays mounted.

`RouteErrorBoundary` (route-level, React Router's `errorElement`) is distinct from `components/feedback/ErrorBoundary.tsx` (a React error boundary wrapping the whole app in `main.tsx`, unchanged) — the former catches an error thrown rendering one specific route without tearing down the app; the latter is the last-resort catch-all. Neither ever renders the raw error's own message — both only log it.

### Implemented routes (all placeholders, all pre-existing from Prompt 0.2/3 — routing itself is unchanged, only what's *inside* each route changed)

| Route | Permission | Nav group |
|---|---|---|
| `/dashboard` | `dashboard:view` | — |
| `/notifications` | `notifications:view` | — |
| `/students`, `/students/:rollNumber`, `/students/:rollNumber/verification` | `student:search` / `student:verify` | Students (list only) |
| `/emergency` | `emergency:manage` | — |
| `/health` | `health:manage` | — |
| `/leave`, `/leave/:id` | `leave:queue:view` | Leave Management (list only) |
| `/approval-history` | `leave:parent_approval:monitor` | Leave Management |
| `/audit` | `audit:view` | Administration |
| `/reports`, `/analytics` | `reports:view` | Reports |
| `/users` | `users:manage` | Administration |
| `/system` | `system:view` | Administration |
| `/settings`, `/help` | none (ungated) | footer |
| `*` (unknown) | — | Not Found, outside the shell (no chrome — nothing authenticated to show) |

## Breadcrumb architecture

`getBreadcrumbTrail(itemId, dynamicLabel?)` (`navigationConfig.ts`) walks: Dashboard (root, except on the Dashboard page itself) → the item's group label, if any → the item's own label → an optional `dynamicLabel` for a parameterized route's real, caller-supplied final segment (e.g. a roll number from `useParams()` — **never fetched**, always passed in by the page itself, per §12's explicit "do not make business API calls merely to create placeholder breadcrumbs"). `PagePlaceholder` accepts `navId`/`dynamicLabel` props and derives its breadcrumb this way; all 17 real pages were updated to pass their `navId` this prompt, so the breadcrumb system is genuinely exercised everywhere, not built and left unused.

## Page template

`layouts/ContentLayout.tsx` **is** the page-template primitive §13 asks for (Dashboard/Management/Table/Detail/Analytics/Settings/Empty/Full-Width page) — implemented as one flexible, prop-driven component (`title`, `description`, `breadcrumb`, `actions`, `status`, `width: "standard"|"wide"|"full"`, `loading`, `error`) rather than eight near-identical wrapper components. A future Leave Queue table page and a future Settings form page differ only in `width` and what they render as `children` — that difference doesn't warrant separate components (§31/§42's own explicit "avoid over-componentization... do not create every component merely because it appears in this list"). `ContentContainer` (the three width variants) is separately exported for standalone reuse by a page that doesn't need the full header apparatus.

`loading`/`error` take over the content region while the breadcrumb/title/actions stay visible — a future feature page gets a correct loading/error UX for free by passing these props, instead of hand-rolling its own switch.

## Loading, error, and denial states

- **Empty** (`EmptyState`, unchanged) — "no data yet."
- **Not Found** (`NotFoundPage`, rebuilt) — no route/resource matches; reveals nothing about whether a differently-shaped identifier might exist.
- **Forbidden** (`AccessDeniedMessage`, enhanced with a "Return to Dashboard" action this prompt) — authenticated, MFA-verified, but lacking the required role/permission; rendered **in place**, never a redirect to `/login` (Prompt 3's own rule, unchanged).
- **Unauthorized** — no authenticated session at all. Deliberately **not** a new page: `RequireAuth`'s existing redirect to `/login` already is this app's unauthorized handling (Prompt 1/2, unchanged) — building a second "Unauthorized" screen would duplicate, not extend, that mechanism.
- **Route-level error** (`RouteErrorBoundary`, new) and **application-level error** (`ErrorBoundary`, unchanged) — see "Routing & protection" above.

## Global UI infrastructure

- **Toast layer** (`components/ui/Toast.tsx`, new) — `ToastProvider`/`useToast()`, mounted once in `AppProviders`. One `aria-live="polite"` region; each toast manages its own auto-dismiss timer independently (adding a second toast never resets the first one's countdown). Infrastructure only — no current caller exists, since no business mutation exists yet to report success/failure for. A future feature calls `useToast().showToast(...)` without re-plumbing a provider.
- **Modal/dialog layer** — `Dialog`/`ConfirmationDialog` (Prompt 0.2, unchanged), built on the native `<dialog>` element for built-in focus trapping/Escape/backdrop — not duplicated by this prompt.
- **Sidebar/layout state** — `useSidebarState` (collapsed, persisted) is the only genuinely cross-cutting UI state this prompt introduced. Current route lives in the router; page title/breadcrumbs live in route/page metadata (`navigationConfig.ts` + page props); no business state (table filters, a future leave-queue store) was added to the shell.

## Responsive strategy

Desktop-first, per §21: persistent 220px sidebar, compact 56px header, restrained padding for data density.

- **≤1024px (tablet)**: sidebar narrows to 200px; the operator can collapse it manually via `SidebarCollapseButton` for more content width. No automatic collapse — a deliberate choice, documented next.
- **≤900px**: the header clock is dropped (least essential control).
- **≤720px**: header horizontal padding/gaps tighten; the search placeholder is dropped first (it carries no functionality yet — the least valuable use of limited space).
- **≤640px**: `StaffIdentity`'s full name/role/scope block is dropped from the header (the always-present `ProfileMenu` trigger remains the identity entry point); `ContentLayout`'s content padding tightens.
- **≤560px**: the "Reception Dashboard" title text is dropped from the header.

**No automatic sidebar collapse at narrow widths was implemented**, by deliberate choice, not oversight: doing so via CSS alone while `NavItem`'s `collapsed` prop stays JS-driven would desync the container's rendered width from whether each item is actually laid out icon-only — a real visual bug (caught and reverted during this prompt's own build, not shipped). A correct fix needs a `matchMedia`-driven JS state, evaluated and deferred as unnecessary complexity for a desktop-first tool per §21/§28's own "do not compromise desktop usability... avoid premature optimization" — the manual, persisted collapse control is sufficient for the "mobile is secondary" requirement. This is a named, intentional trade-off, not a gap discovered later.

## Accessibility strategy

- **Landmarks**: `<nav aria-label="Primary">` (sidebar), `<header>`/banner, `<main id="main-content">`, `<footer>`/contentinfo — four real semantic elements, not styled `<div>`s.
- **Skip link**: `SkipLink` is the first focusable element on every authenticated page, jumping straight to `#main-content`.
- **Keyboard**: every interactive element (nav links, collapse button, header controls, profile menu, dialogs) is a real, natively-focusable element in a natural tab order — no custom key-handling was built where the platform default already works, and no roving-tabindex/arrow-key menu semantics were claimed without being implemented (`ProfileMenu`'s own doc comment explains this choice explicitly).
- **Focus**: `ProfileMenu` focuses its first item on open and returns focus to its trigger on Escape-close — the one place in this shell a focus-restoration contract was needed.
- **Never color-only**: active nav state (border + weight + `aria-current`), connectivity status (icon + `aria-label`, not just a colored dot), disabled controls (a real `disabled` attribute, not merely muted color).
- **Reduced motion**: the existing `global.css` rule (unchanged) covers every animation this prompt added (the toast's entrance transition, the sidebar's width transition) — nothing new was added outside that rule's scope.

## Performance strategy

Route-level code splitting (`React.lazy`, unchanged from Prompt 0.2 — this prompt did not touch it) already lazy-loads every page. The shell itself (`Sidebar`/`Header`/layout chrome) is not lazy-loaded — it's needed on every authenticated screen, so splitting it would only add a second network round-trip with no benefit. `useVisibleNavigation` memoizes its filtered result; `AuthorizationContext`'s `hasPermission` reference is stable across renders where authorization state hasn't changed. No new heavyweight state-management dependency was added. The built `LoginPage` chunk remains 8.15 kB gzip 3.09 kB (unaffected by this prompt); the pre-existing ~530 kB main-chunk warning is unrelated to shell code and was not addressed here (a documented, unrelated, pre-existing finding — not this prompt's scope).

## Open dependencies (carried forward, not resolved here)

- **Hostel-name lookup** — `StaffIdentity` shows scope honestly (see above) rather than a name; a real lookup is a future, separate piece of work.
- **`configuration:manage` has no route** — the permission exists (Prompt 3) for a future Hostel Configuration module that has no route/page yet; correctly not linked from the sidebar since there is nowhere to send the click.
- **"Head Warden"** — still absent, still `REQUIRES DECISION` (unchanged from Prompt 1/2/3/QG-01 — see `docs/authorization.md`).
- Staff provisioning, MFA recovery, exact permission-grant table, hosted rate-limit thresholds — all unchanged, all still open (unaffected by a frontend-shell prompt).

## Testing

`vitest`/`@testing-library/react`, this app's existing convention (no `jest-dom` — none is installed). New/updated test files: `Sidebar`, `Header`, `ProfileMenu`, `NavItem`, `StaffIdentity`, `ConnectivityStatus`, `Toast`, `DashboardLayout`, `ContentLayout`, `NotFoundPage`, `PagePlaceholder`, `RouteErrorBoundary`, `AccessDeniedMessage` (enhanced), `sidebarState` (persistence), `navigationConfig`, `useVisibleNavigation` — 239 reception-dashboard tests passing (see the final implementation report for exact counts). Every test asserts real, user-visible/keyboard/authorization behavior — accessible names, `aria-current`/`aria-label`/`role` semantics, permission-filtered visibility, focus movement, real navigation outcomes — not implementation details or snapshots.
