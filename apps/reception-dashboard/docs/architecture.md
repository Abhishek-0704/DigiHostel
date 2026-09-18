# Reception Dashboard — Scaffolding Architecture (Prompt 0.2)

This document records what Prompt 0.2 actually built, why, and what remains deliberately unimplemented. The planning source of truth is [`docs/reception-dashboard-architecture.md`](../../../docs/reception-dashboard-architecture.md) (repo root, Prompt 0.1) — this document is the as-built record of the scaffolding pass, not a second planning pass. See [`docs/reception-dashboard-architecture-security-review.md`](../../../docs/reception-dashboard-architecture-security-review.md) (repo root, Prompt 0.3) for the independent ASRB review of this foundation, [`authorization.md`](authorization.md) (Prompt 3) for the RBAC/authorization layer built on top of it, [`authentication.md`](authentication.md) (Prompt 1) for the real password+MFA authentication infrastructure — password sign-in, session lifecycle, timeout, logout, audit logging — that both of those build on, and [`dashboard-shell.md`](dashboard-shell.md) (Phase 2, Prompt 4) for the permanent enterprise shell (header, sidebar, navigation model, routing/breadcrumb/page-template infrastructure) that replaced this document's own placeholder `DashboardLayout`/`Sidebar`/`Header`/`ContentLayout`/`NotFoundPage` — the folder structure and "real vs. interface-only" inventory below describe the Prompt 0.2 scaffolding pass as it stood then; `dashboard-shell.md` is authoritative for the shell's current, real state. See [`dashboard-home.md`](dashboard-home.md) (Phase 2, Prompt 5) for the real Dashboard Home page that replaced this document's own placeholder `DashboardHomePage` — every business service listed as "interface only" below remains exactly that; Prompt 5 built only the presentation layer over them. See [`notification-center.md`](notification-center.md) (Phase 2, Prompt 6) for the real Notification Center that replaced this document's own placeholder `NotificationsPage` — `NotificationService` is no longer interface-only (it now really returns an honestly-empty list), but still has no real notification producer behind it. See [`leave-queue.md`](leave-queue.md) (Phase 3, Prompt 7A) for the real Reception Leave Request Queue that replaced this document's own placeholder `LeaveQueuePage`/`LeaveService` — the "no business table is read anywhere in this app" statement below now has its first documented exception (a real, narrowly-scoped, hostel-scoped staff endpoint), and item 1 of the "open decisions" list immediately below (a staff-scoped listing capability) is resolved for read access; the reception-initiated-leave-request-creation half of that same open decision remains unresolved.

## Framework decision

Vite + React 19 + TypeScript SPA, client-side routed via `react-router-dom`, per [`docs/adr/ADR-023`](../../../docs/adr/ADR-023-reception-dashboard-web-framework.md) (ACCEPTED as part of this scaffolding task — see that ADR for why an ADR was written now rather than left implicit).

## Folder structure

```
apps/reception-dashboard/
├── index.html, vite.config.ts, tsconfig.json, package.json, env.example
├── docs/architecture.md          this document
└── src/
    ├── main.tsx                  entry point — registers the API client, mounts <App/>
    ├── App.tsx                   AppProviders + RouterProvider
    ├── vite-env.d.ts             Vite/import.meta.env typing
    ├── app/
    │   ├── providers/            AppProviders.tsx — composition root
    │   └── initialization/       registerApiClient.ts — one-time bootstrap
    ├── routes/                   router definition (index.tsx) + RequireAuth/RequireRole guards
    ├── layouts/                  Authentication/Dashboard/Content/Settings/Fullscreen shells
    ├── pages/                    one placeholder component per route (no business data)
    ├── features/                 per-module folders (leave/, parent-approval/, students/, …) —
    │                             each currently holds only a README describing what's deferred
    ├── components/
    │   ├── ui/                   Button, Card, Dialog, ConfirmationDialog, Table, SearchInput,
    │   │                         FormField, StatusBadge, LoadingIndicator, Skeleton, EmptyState,
    │   │                         ErrorState — real, functional, accessible primitives
    │   ├── layout/                Sidebar, Header, Breadcrumb
    │   ├── feedback/               ErrorBoundary, NotificationIndicator
    │   └── navigation/             NavItem
    ├── hooks/                     useRealtimeChannel (generic lifecycle only)
    ├── contexts/                  SessionContext, AuthContext (placeholder), ThemeContext
    ├── services/                  auth/api/realtime are real infra; students/leave/parent-approval/
    │                             notifications/audit/emergency/health/dashboard/reports are
    │                             INTERFACES ONLY — see each file's doc comment
    ├── lib/
    │   ├── supabase/client.ts    Supabase client factory (session management only)
    │   ├── query/queryClient.ts   TanStack Query client
    │   ├── logging/logger.ts      console wrapper
    │   └── errors/errors.ts       AppError taxonomy + safe-message mapping
    ├── state/                     sidebarState.ts — the one genuinely cross-cutting UI state
    ├── types/roles.ts             StaffRole, mirrors packages/db/src/schema/enums.ts exactly
    ├── constants/routes.ts        ROUTES path constants
    └── styles/                    tokens.ts/tokens.css/global.css — ported from
                                  apps/parent-mobile/src/styles/tokens.ts's values
```

`utils/` and `assets/` from Prompt 0.2 §8's suggested tree are intentionally **not** populated — nothing needs them yet, and creating empty placeholder files there would be exactly the "dead placeholder code" Prompt 0.2 §31 forbids. Add them when a real cross-feature helper or a real asset exists.

## A resolved conflict: no centralized `tests/` directory

Prompt 0.2 §8 suggests a top-level `tests/` directory. This repository's own documented convention (`docs/workspace-structure.md`: *"per-package unit/integration tests are colocated in each apps/\* or packages/\* package instead, not centralized"*) is followed instead — every `*.test.ts` file here sits next to the module it tests (e.g. `src/contexts/authStatus.test.ts`), matching `apps/api` and `apps/parent-mobile` exactly. Per the source-of-truth hierarchy this prompt itself specifies (§1 — existing repository configuration outranks the prompt's own generic suggestion), this is a deliberate deviation, not an oversight.

## `lib/` vs `services/` placement

Logging and error-handling live under `lib/logging/` and `lib/errors/` (matching Prompt 0.2 §8's explicit tree) rather than under `services/` the way `apps/parent-mobile` happens to organize its own equivalents — there is no repo-wide convention forcing one shape, and this prompt's own tree is followed for this new app specifically.

## What is real vs. interface-only

**Real, working infrastructure:**
- Supabase client (session management only — no business query anywhere)
- TanStack Query client
- API client bootstrap (`setApiBaseUrl`/`setAuthTokenProvider`, wired into `@digihostel/api-client-react`)
- Generic realtime channel lifecycle (no business table subscribed)
- `authService` (session get/subscribe/sign-out) and `mfaService` (real `auth.mfa.*` wrappers — see "Authentication & MFA architecture" below)
- Error taxonomy, logger, RequireAuth/RequireRole route guards (both fail closed — see their own doc comments)
- Every `components/ui/*` primitive
- Router with lazy-loaded placeholder pages for every path Prompt 0.2 §9 lists

**Interfaces only, explicitly not implemented (per file):** `StudentService`, `ParentApprovalService`, `AuditService`, `EmergencyService`, `HealthService`, `DashboardService`, `ReportService`. `NotificationService` (Prompt 6) and `LeaveQueueService`/`LeaveService.ts` (Prompt 7A, [`leave-queue.md`](leave-queue.md)) are now real, working implementations — see their own docs for what each still does not cover.

## Shared package change

`packages/api-client-react/src/custom-fetch.ts` gained `setApiBaseUrl()` (mirroring the existing `setAuthTokenProvider()` pattern) — its base URL was previously read only from `process.env.EXPO_PUBLIC_API_BASE_URL`, an Expo-bundler-specific convention with no equivalent in a Vite bundle. Backward-compatible: neither Expo app calls the new setter, so their behavior is byte-for-byte unchanged. See `docs/adr/ADR-023`'s Consequences and `custom-fetch.test.ts`'s new test cases.

## Authentication & MFA architecture (ADR-024)

**Staff authentication mechanism is now an accepted decision**: Supabase Auth password sign-in + mandatory native TOTP MFA (`auth.mfa`), per [`docs/adr/ADR-024`](../../../docs/adr/ADR-024-reception-dashboard-staff-authentication.md). This scaffolding pass implements the **state architecture** only, not the login/MFA UI:

- `src/services/auth/authService.ts` — session get/subscribe/sign-out (unchanged, still no sign-in method — that's Prompt 2's job, calling `authService`/`mfaService` from a real screen).
- `src/services/auth/mfaService.ts` (new) — thin, real wrappers around `supabase.auth.mfa.*` (`getAssuranceLevel`, `listFactors`, `enrollTotp`, `challenge`, `verify`, `unenroll`). No custom TOTP protocol; no manually-stored secret anywhere in this app or `packages/db`.
- `src/contexts/authStatus.ts` — `AuthStatus` is now `"loading" | "config_error" | "unauthenticated" | "mfa_required" | "authenticated"`. **`"authenticated"` is reached only when Supabase's own Authenticator Assurance Level is genuinely `aal2`** — a password-only session (`aal1`, whether or not a factor is even enrolled yet) always reports `"mfa_required"`, never `"authenticated"`. This is the explicit security rule Prompt 0.2 §13 requires: password authentication alone is never sufficient.
- `src/contexts/AuthContext.tsx` — re-checks the assurance level whenever the session changes; fails closed (treats an unreadable assurance level as `"mfa_required"`, never as authorized) if the check itself errors.
- `src/routes/RequireAuth.tsx` — treats `"mfa_required"` exactly like `"unauthenticated"`: both redirect to `/login`. No separate `/mfa-challenge` route was invented — Prompt 2 is expected to handle both steps within that one route, since no UX design for a split flow exists yet.
- `src/routes/RequireRole.tsx` — unchanged, still fails closed (no staff-profile/role source exists yet — a separate, still-open piece of work unaffected by ADR-024, which resolves the authentication *mechanism* only, not role/permission resolution).
- `src/lib/errors/errors.ts` — gained `invalid_credentials`, `mfa_challenge_failed`, `mfa_enrollment_failed` error kinds with pre-approved safe messages, ready for Prompt 1/2 to use (none leaks credential/secret/account-existence detail).

**Implemented since (Prompt 2)**: the real login screen + MFA challenge screen — see [`login-experience.md`](login-experience.md). **Still not implemented, by explicit instruction**: an MFA enrollment screen, an MFA recovery flow — neither is part of the normal login experience (Prompt 2 §10/§37: enrollment/recovery are staff-provisioning-owned, separate concerns). **Not decided by ADR-024**: whether `apps/api`'s own JWT verification should also enforce `aal2` server-side for every future staff route by convention (Prompt 3 answered this for the one route that existed at the time — see `authorization.md` — but did not establish a blanket policy); the exact staff-provisioning flow (temporary password + forced enrollment vs. invite link).

## Other open decisions (carried over from Prompt 0.1, not resolved by scaffolding)

1. **Reception-initiated leave requests** vs. the current student-only `POST /leave-requests` contract — unresolved SDD/API conflict, `docs/reception-dashboard-architecture.md` §9/§35.
2. **CORS origins** for this app's dev/staging/production URLs — not yet configured on `apps/api`.
3. **Whether `apps/api` should enforce `aal2` server-side** (ADR-024's Consequences) — a new open question from this pass.
4. Everything else listed in `docs/reception-dashboard-architecture.md` §35.

## Two leave-domain concepts (Prompt 0.2 §3 — recorded for future prompts, not yet modeled)

This scaffolding pass introduces no data model, so neither concept is implemented here, but both are recorded so a later prompt doesn't conflate them:
- **DigiHostel Hostel-Leaving Request** — created by the student in the Student App, monitored/actioned by Reception, requires parent approval via the existing `leave_requests`/`leave_approval_events` backend.
- **KIIT SAP Holiday Request** — a separate, SAP-sourced, mentor-approved request. DigiHostel does not create or approve it; a web-scraping mechanism is meant to import its status, but **no such scraper exists anywhere in this repository** (confirmed by inspection during Prompt 0.1 and re-confirmed during this scaffolding pass — not found in `apps/api/src/domain/`, not mentioned in `docs/current-state.md`). SAP mentor approval is never to be treated as equivalent to parent approval, and `leave_requests.status` must never be set from SAP-derived data.
