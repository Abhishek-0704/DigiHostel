# Enterprise Operations Monitoring Center (Phase 7, Prompt 18)

Replaces the `SystemPage.tsx` placeholder self-labeled "Phase 7, Prompt 18" since Prompt 0.2. Reuses the existing `system:view` permission (granted only to `super_admin` since Prompt 3) and the existing AAL2 staff boundary — no new role, permission, or authentication mechanism was introduced.

## 1. Architecture

```
Signal (real DB query / real Supabase Auth Admin API call / reused domain service)
  ↓
MonitoringRepository (domain/monitoring/repository.ts) — genuinely measures each infra signal
  ↓
MonitoringService (domain/monitoring/service.ts) — aggregates + classifies, reuses AnalyticsService/EmergencyService/HealthService
  ↓
GET /api/v1/monitoring/overview, /monitoring/diagnostics, POST /monitoring/diagnostics/{id}/run
  ↓
useMonitoringOverview / useDiagnostics (features/monitoring/)
  ↓
SystemPage.tsx + components/monitoring/*
```

No persistent monitoring table was created (see §7). Every number on this page is either a genuine, directly-measured signal or a read-only reuse of an already-certified domain service's own `getStatistics()`/`getOverview()` method — never a duplicated calculation.

## 2. Platform Health Model

States: `healthy`, `warning`, `degraded`, `unavailable`, `unknown` (`domain/monitoring/types.ts`).

Severity order (worst to best): `unavailable(4) > degraded(3) > warning(2) > unknown(1) > healthy(0)`.

`platformStatus` is the **maximum severity** across the three infrastructure signals (database, Supabase Auth, realtime publication) — never derived from operational/security counters, which are informational context, not infrastructure health. `unknown` is deliberately more severe than `healthy`: a dependency this backend could not evaluate must never be silently absorbed into an aggregate "healthy" verdict (live-verified in `routes/monitoring.test.ts`, test F).

Application module rows (§4) mirror `platformStatus` directly (with `warning` collapsed to `healthy`, since a warning-level infra signal does not necessarily block a given module's own request path) — every listed module is a route-group of the same `apps/api` process over the same Postgres connection, never an independently-measured microservice with its own fabricated SLA.

## 3. Infrastructure Signals (genuinely measured)

| Signal | How it's measured | Unavailable when |
|---|---|---|
| Database | `select 1` against the primary Postgres connection, timed | Query throws or times out (5s) |
| Supabase Auth | A real `auth.admin.listUsers({ page: 1, perPage: 1 })` call via a dedicated, narrow `SupabaseAuthProbe` (not the Identity Administration Center's own `StaffIdentityAdminPort` — see `authProbe.ts`'s doc comment for why they're deliberately separate) | Call throws, times out, or `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are unset (reported `unknown`, not `unavailable` — this backend genuinely cannot tell whether the dependency itself is down or merely unconfigured) |
| Realtime Publication | `select tablename from pg_publication_tables where pubname = 'supabase_realtime'`, diffed against a fixed, hand-maintained list of every table this codebase has ever added to that publication (F-08, F-QG02-04, and every business-table subscription since) | Any expected table is missing (`degraded`) or the query itself fails (`unavailable`) |

Live-verified against the real local Supabase instance (see §11) — all three genuinely measured, not asserted from documentation.

## 4. Application Health

The 13 currently-implemented Reception Dashboard modules (Dashboard, Authentication, Notification Center, Student Operations, Student Movement, Emergency Operations, Health Operations, Audit Center, Identity Administration, Configuration Center, Operational Intelligence, Enterprise Reporting, Profile Center) are represented honestly as **"Operationally available through Reception API"** rather than independent services with their own uptime — none of them expose an independent health signal, and none was fabricated to appear as if they did.

## 5. Operational Health (read-only reuse, zero duplicated logic)

| Metric | Source |
|---|---|
| Pending Leave Authorizations | `AnalyticsService.getOverview().leave.pendingNow` |
| Students Outside Hostel | `AnalyticsService.getOverview().presence.studentsOutside` |
| Active / Critical Emergencies | `EmergencyService.getStatistics()` |
| Active / Critical Health Cases | `HealthService.getStatistics()` |
| Notifications Failed (24h) | `AnalyticsService.getOverview().notifications.failedInPeriod` — `null` (rendered "Not available") only if the aggregate itself could not be computed, never a fabricated 0 |
| Library Operations | Honestly `"future"` — no Digital Library Pass backend exists anywhere in this repository |

Every one of these is a fresh `Promise.all`-parallelized call to an already-certified service — this module contains no independent leave/emergency/health query of its own.

## 6. Security Health

| Metric | Source |
|---|---|
| Failed MFA Attempts (24h) | Direct count of `audit_logs` rows with `action = 'staff_mfa_failure'` in the trailing 24h (the existing staff-auth audit trail, Prompt 1) |
| Suspended Staff Accounts | Direct count of `staff` rows with `status = 'suspended'` — **deliberately NOT routed through `StaffAdminService`**, whose repository requires a live Supabase Auth Admin API credential just to construct (see §7's "no fake infrastructure but also no unnecessary external dependency" note) |
| Administrative Account Changes (24h) | Direct count of `audit_logs` rows with `action IN ('staff.role_changed', 'staff.hostel_changed', 'staff.force_signed_out')` in the trailing 24h |

No password, MFA secret, session token, or raw investigative detail is ever exposed — only aggregate counts, matching this module's own data-minimization requirement (verified live in §11's "no secrets in response" check).

## 7. Database Design Discipline — no new table

Every requirement this prompt named as *potentially* justifying persistence (alert history, diagnostic execution history, acknowledged incidents) was evaluated and found **not** to need a new table:

- **Diagnostic execution** is recorded as one `audit_logs` row per run (`action: "monitoring.diagnostic_run"`, `entityType: "staff"`) — the existing Enterprise Audit Center architecture already supports this event type without any schema change.
- **Alerts** are derived live from the same request's health signals every time (§8) — no consumer in this codebase needs an alert to survive past the request that produced it.

No migration, no RLS policy, and no persistent monitoring table exist for Prompt 18. If a future requirement genuinely needs alert acknowledgement or diagnostic history to survive across requests, that is new, explicitly-scoped work — not retrofitted here.

## 8. Alert Management Strategy

Alerts are **derived, not persisted** — computed fresh on every `GET /monitoring/overview` from the same signals that produced the rest of the response:

- Any infrastructure signal in `degraded`/`unavailable` → a `warning`/`critical` alert.
- `criticalEmergencies > 0` / `criticalHealthCases > 0` → a `critical` alert linking to the respective Center.
- `recentMfaFailures24h >= 5` → a `warning` alert.

**Deferred, not built**: acknowledgement, persistence, resolution lifecycle, and a dedicated alert-history table. No existing consumer needs any of these; inventing a persistence layer (ownership, RLS, audit) for a capability nothing currently requires would be exactly the premature complexity this project's own conventions warn against.

## 9. Diagnostics Architecture

Four allow-listed, read-only checks (`domain/monitoring/diagnostics.ts`) — `database_connectivity`, `supabase_auth_admin_api`, `realtime_publication_integrity`, `staff_role_enum_integrity`. Every one reuses the exact same `MonitoringRepository` methods `GET /monitoring/overview` uses for its infrastructure signals, so the two surfaces can never silently disagree.

Security properties:
- `diagnosticId` is validated against this **fixed, server-owned list** — `POST /monitoring/diagnostics/{unknown}/run` returns `404` and never executes anything (live-verified, §11).
- No diagnostic accepts a client-supplied URL, SQL fragment, table/column name, or shell command — every check's SQL is hand-written and parameter-free.
- Bounded by a 5-second timeout (`withTimeout`) — a hung dependency produces a timely `unavailable` result, never an unresolved request.
- `super_admin` + AAL2-only, reusing the exact same `requireStaffRole`/`requireAal2` guards as every other route in this module.
- Execution is recorded in the existing `audit_logs` table (fire-and-forget, matching `staffAuthAudit.ts`'s established convention — an audit write failure never blocks the response).
- Diagnostics never mutate application or database state.

## 10. RBAC / RLS

No new permission, role, or RLS policy. `system:view` (granted only to `super_admin`, `lib/authorization/policy.ts`) already gated the frontend route; the backend now independently enforces the identical boundary via `requireStaffRole("super_admin")` + `requireAal2()` on every `/monitoring/*` route (verified: a `reception_warden` AAL2 session receives `403 role_required`; a `super_admin` AAL1 session receives `403 insufficient_assurance` — `routes/monitoring.test.ts`, tests B/C, and live-reproduced in §11).

## 11. Live, Real End-to-End Verification

Performed against a real running `apps/api` process (built from source, `node dist/index.js`) and a real local Supabase instance — no mocks:

1. Real password sign-in (`superadmin1@example.test`) → real `aal1` session.
2. Real TOTP factor enrollment + a genuinely computed 6-digit code (RFC 6238, plain Node `crypto`, no new dependency) → real `aal2` session.
3. Unauthenticated `GET /monitoring/overview` → **401**.
4. Authorized `super_admin` AAL2 `GET /monitoring/overview` → **200**, with all three infrastructure signals genuinely `healthy` (database, Supabase Auth Admin API, realtime publication — all three real, live-measured facts, not fixture data).
5. Response body scanned for `service_role`/`secret`/`password`/`jwt_secret`/connection-string substrings → **absent**.
6. `GET /monitoring/diagnostics` → the real, fixed 4-item catalog.
7. `POST /monitoring/diagnostics/drop_table_students/run` (an unrecognized id) → **404**, never executed.
8. `POST /monitoring/diagnostics/realtime_publication_integrity/run` → **200**, a genuine `pass` result from a real query.
9. A real `reception_warden` session (`reception1@example.test`) → **403** on `GET /monitoring/overview` (`system:view` correctly withheld).

**13/13 checks passed.** Live browser UI verification (through the actual rendered Reception Dashboard) was **not performed** — `apps/reception-dashboard/.env.local` remains covered by a Read/Write deny rule in this session's own permission settings (the identical, previously-documented environment constraint from the Phase 7 Prompt 17 certification pass) — classified **UNVERIFIED — BLOCKED BY ENVIRONMENT**, not claimed as passing.

## 12. Refresh Strategy

Deliberately **no auto-polling and no realtime subscription** for the aggregate overview — every fetch performs a real round-trip to the Supabase Auth Admin API among other checks, so an aggressive interval would create unnecessary load against an external, rate-limited dependency for a `super_admin`-only console with no legitimate need to poll every few seconds. A manual "Refresh" button re-fetches everything fresh, mirroring `AnalyticsPage`/`AuditPage`'s own established "manual refresh, no realtime" precedent. The one genuinely live signal on the page — "Realtime Connection (this session)" — reuses the **existing** `useRealtimeConnectionProbe` hook (Prompt 5) rather than a second implementation.

## 13. Future Observability Readiness (not implemented)

The architecture separates Signal → Health Check → Health Result → Aggregation → Monitoring API → Monitoring UI cleanly enough that a future OpenTelemetry/Prometheus/Grafana/Sentry integration could plug in as an additional signal source feeding `MonitoringService.getOverview()`, without redesigning the aggregation, API, or UI layers. None of these were implemented, evaluated as a dependency, or referenced by name anywhere in the runtime code — this section documents an integration boundary, not a partially-built feature.

## 14. Deferred / Unavailable (explicit, not silent)

- Hostel occupancy against room/bed capacity — no capacity column exists anywhere on `hostels`/`rooms` (re-confirming Prompts 15/16's identical finding).
- Digital Library Pass operational status — no backend exists for this domain.
- Alert acknowledgement/persistence, diagnostic execution history as a queryable list (only as `audit_logs` rows) — see §7/§8.
- CPU/memory/uptime/replication/backup-status percentages — genuinely unmeasurable from this application's own safe, authorized signals; never fabricated.
