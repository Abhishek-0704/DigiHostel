# Enterprise Audit Center & Approval History (Phase 5, Prompt 12)

Replaces Prompt 0.2's `AuditPage`/`ApprovalHistoryPage` placeholders and the interface-only `AuditService` stub. Two features, built on entirely existing, already-certified infrastructure — no new database table, no new RLS policy, no new migration, no new permission, no new authentication mechanism.

## 1. Reconnaissance summary

Before writing any code, the actual repository state was verified against every assumption in this prompt:

| Assumption | Status |
|---|---|
| `audit_logs` exists, zero client-facing RLS | **VERIFIED** — `packages/db/src/schema/audit.ts`, no policy of any kind for any role |
| A privileged read endpoint already exists | **VERIFIED MISSING** — no route anywhere referenced `auditLogs` for SELECT |
| Every module writes to `audit_logs` automatically | **PARTIALLY VERIFIED** — leave, movement, emergency, health, device, staff-auth all write it; two inconsistent write conventions exist (transactional-inline vs. fire-and-forget), a genuine pre-existing gap, **not remediated here** (out of this feature's read-only scope) |
| `audit:view` permission | **VERIFIED EXISTING** — `apps/reception-dashboard/src/lib/authorization/permissions.ts`, granted to `reception_warden`/`hostel_admin`/`super_admin` since Prompt 3 |
| Nav items, routes, permission gates for `/audit` and `/approval-history` | **VERIFIED EXISTING** — both pre-scaffolded in Prompt 0.2, explicitly deferred to "Phase 5, Prompt 12" |
| Approval History needs a new endpoint/state machine | **VERIFIED FALSE** — `GET /leave-requests/queue` already returns the caller's full hostel-scoped set of leave requests, every status, including terminal outcomes; `SessionTimeline`/`useLeaveApprovalEvents`/`LeaveDetailPage` (`/leave/:id`) already render the complete real approval timeline for any individual request |

## 2. Source-of-Truth Map

| Requirement | Authoritative Source | Existing/New | Read Path | Status |
|---|---|---|---|---|
| Audit trail (who did what) | `audit_logs` | Existing | New `GET /api/v1/audit` (privileged, service-role) | Implemented |
| Audit statistics | `audit_logs` (aggregated) | Existing | New `GET /api/v1/audit/statistics` | Implemented |
| Leave approval history | `leave_requests` + `leave_approval_events` | Existing | Existing `GET /leave-requests/queue` (list) + existing `GET /leave-requests/{id}/events` (timeline, via `LeaveDetailPage`) | Reused, unmodified |
| Movement/exit-return history | `leave_exit_authorizations`, `movements` | Existing | Surfaced only as `audit_logs` entries (`movement.hostel_return_recorded`, `entityType: leave_requests`) — no dedicated movement timeline UI exists yet; not fabricated | Reused (audit trail only) |
| Emergency/health history | `security_incident_events`, `health_case_events` | Existing | Existing per-case detail pages' own timelines (unmodified); also surfaced as `audit_logs` entries | Reused |
| Staff notification producer events | — | **Does not exist** | — | VERIFIED DEFERRED (unchanged from QG-03's own classification — not built here) |
| Library events | — | **Does not exist** | — | FUTURE — no adapter built, nothing fabricated |

## 3. Audit read architecture

```
Reception Dashboard (AuditPage)
  -> AuditService (thin transport wrapper, apps/reception-dashboard/src/services/audit/AuditService.ts)
  -> generated listAuditEvents()/getAuditStatistics() (Orval, from openapi.yaml)
  -> Fastify GET /api/v1/audit, GET /api/v1/audit/statistics
     (apps/api/src/routes/audit.ts)
  -> AuditService (apps/api/src/domain/audit/service.ts, thin pass-through)
  -> DrizzleAuditRepository (apps/api/src/domain/audit/repository.ts)
  -> Fastify's service-role Postgres connection (bypasses RLS by design,
     ADR-006/ADR-014 — same as every other privileged staff read in this
     codebase)
  -> audit_logs (raw SQL, never touched by the ORM's typed query builder —
     see §4)
```

`audit_logs` has **zero client-facing RLS** — it always has, by design, and this feature does not change that. No frontend code, and no Supabase Realtime subscription, ever reads this table directly. The only way to reach it is through the two routes above, both requiring an authenticated AAL2 staff session with `role IN (reception_warden, hostel_admin, super_admin)` — identical to every other certified staff route (`routes/emergencies.ts`, `routes/health-cases.ts`).

## 4. Hostel-scope resolution (the core design problem)

`audit_logs` has no `hostel_id` column — it is a flat, polymorphic `(actor_type, actor_id, action, entity_type, entity_id, metadata, occurred_at)` trail. A row's hostel relevance can only be derived by joining `entity_id` back to the table `entity_type` names:

| `entity_type` | Hostel resolution |
|---|---|
| `leave_requests` | `leave_requests.student_id -> students.hostel_id` |
| `security_incidents` | `security_incidents.student_id -> students.hostel_id` |
| `health_cases` | `health_cases.student_id -> students.hostel_id` |
| `staff` | `staff.hostel_id` directly |
| `trusted_devices`, `device_registration_challenges` | **No hostel concept at all** — these are parent-account security events |

`DrizzleAuditRepository` implements this as a single raw-SQL CTE (`RESOLVED_CTE`) with `LEFT JOIN`s gated by `entity_type =`/`actor_type =`, `COALESCE`-ing across the (mutually-exclusive, since only one join can ever match a given row) candidate hostel/student/actor columns. `reception_warden`/`hostel_admin` are filtered to `resolved.hostel_id IN (their own staff.hostel_id)`; `super_admin` bypasses the filter entirely (`sql\`true\``, matching every other repository's `scopeCheck` convention in this codebase).

**Rows with no resolvable hostel (`trusted_devices`, `device_registration_challenges`) are therefore invisible to `reception_warden`/`hostel_admin` by construction** — `NULL` never equals a real hostel id — not by an extra `if` branch that could be forgotten. Only `super_admin` sees them. This is a deliberate data-minimization boundary (§38): reception staff have no legitimate need to see a parent's device-security events.

Module (`leave`/`movement`/`emergency`/`health`/`device`/`staff-auth`/`other`) is derived server-side from the `action` column's own prefix — never a stored column, never a client-supplied value.

## 5. No `GET /audit/:id` endpoint — a deliberate simplification

The list response (`AuditListItem`) already carries every field the detail panel needs (actor, student, hostel, metadata). Rather than build a second by-id lookup endpoint, the frontend detail panel renders directly from the already-fetched row. This eliminates an entire class of IDOR surface (§37) rather than merely defending it — there is no `entity_id`-shaped parameter anywhere in the API that a caller could probe for another hostel's record.

## 6. Approval History — reuse, not a new feature

`ApprovalHistoryPage` (`/approval-history`) calls `useLeaveQueue()` — the exact same hook, query key, and already-certified `GET /leave-requests/queue` endpoint the Leave Queue page (`/leave`) uses. The only difference is presentation: this page default-filters to terminal statuses (`approved`/`rejected`/`expired`, via the existing `TERMINAL_LEAVE_STATUSES`/`isTerminalLeaveStatus` from `features/leave/types.ts`) and sorts by `updatedAt` descending (most recently decided first), with a toggle to see every request regardless of status. Selecting a row navigates to the existing `/leave/:id` (`LeaveDetailPage`), which already renders the complete, real `leave_approval_events` timeline via `SessionTimeline` — not duplicated here.

**The Parent App remains the sole owner of parent authentication and parent approval decisions.** This page performs zero writes and introduces no new authorization boundary — it reuses `useLeaveQueue`'s existing hostel-scoped result set unmodified.

## 7. Search, filtering, sorting, pagination

`GET /audit` mirrors `GET /emergencies`'s established query-parameter/response-envelope convention exactly: `.strict()` Zod validation (unrecognized fields → `400`), `page`/`pageSize`/`sortDir`, `q` (case-insensitive prefix match — never a full `ILIKE '%...%'` scan — against the resolved student name/roll number or actor name), `module`/`actorType`/`entityType` array filters, `dateFrom`/`dateTo` (validated `dateFrom <= dateTo` server-side, `400` otherwise). Response: `{ items, total, page, pageSize }`, identical shape to `EmergencyList`/`HealthCaseList`. Sorting has a deterministic secondary key (`resolved.id`) after `occurred_at`, matching every other list endpoint's own tie-breaker discipline.

## 8. Realtime — deliberately not built

No realtime subscription exists for the Audit Center. `audit_logs` is not, and per its own documented design should not become, a member of the `supabase_realtime` publication — doing so would require relaxing its zero-RLS boundary solely for convenience, which this feature's own governing instructions explicitly forbid. "Refresh" is a manual, honest re-fetch; no "Live" indicator is shown.

## 9. Security

- Authorization chain unchanged: Password → TOTP MFA → AAL2 → Staff Identity → Role → Permission (`audit:view`) → Hostel Scope → Backend Authorization → (no RLS involvement — service-role bypass, same as every other staff route).
- No client-supplied `staffId`/`hostelId`/`role` field has any effect — both are always resolved server-side from `request.auth.profile`, and `.strict()` schema validation rejects any attempt to smuggle one in as a query parameter with `400`.
- Cross-hostel isolation independently verified: (a) route-level tests with a fake repository proving `reception_warden` (Hostel A) never sees Hostel B's event and vice versa; (b) a real-Postgres integration test driving genuine `DrizzleEmergencyRepository.create()`/`DrizzleHealthRepository.create()` calls (never a hand-inserted `audit_logs` fixture row) and proving `DrizzleAuditRepository` correctly includes the row for same-hostel staff, a *different* same-hostel staff member (proving hostel-based, not staffId-based, scoping), and `super_admin`, while excluding it entirely for the other hostel's staff.
- Audit immutability: no route in `routes/audit.ts` performs any write. `AuditService`/`AuditRepository` expose no mutation method at all.

## 10. Extension model (future, not implemented here)

`AuditModule`/`AuditEntityType` are closed enums today. A future Library Operations module, User Management, or Configuration change log would extend these vocabularies and add a corresponding `LEFT JOIN` branch to `RESOLVED_CTE` — no architectural change required, but genuinely not built in this prompt. Export/CSV/PDF generation, scheduled reports, and a compliance engine are explicitly out of scope (Prompt 16's domain).

## 11. Testing

- Backend: `apps/api/src/routes/audit.test.ts` (16 tests — auth/AAL2/role/hostel-scope/pagination/module-filter/search/malformed-query/date-range-validation/no-client-supplied-scope), `apps/api/src/domain/audit/repository.integration.test.ts` (5 tests, real Postgres, `RUN`-gated on `DATABASE_URL`).
- Frontend: `apps/reception-dashboard/src/pages/AuditPage.test.tsx` (13 tests), `ApprovalHistoryPage.test.tsx` (6 tests) — rendering, filters, search, pagination, detail panel, loading/empty/error states, keyboard (Escape-close, focus-on-open).
- pgTAP: unchanged (347/347) — no schema/RLS file was touched.
- Full workspace regression: unchanged pre-existing tests all still pass (1604 passed, 6 skipped, 0 failed — up from 1564, the +40 are exactly this feature's own new tests).
