# API Contract Reference

The SDD specifies RESTful resource-oriented APIs under `/api/v1`, JSON payloads, HTTPS, idempotency where applicable, and consistent status/error handling.

Authentication/authorization:
- JWT
- RBAC
- trusted-device verification for parents
- biometric-backed sensitive operations

Endpoint families from the SDD:
- `/api/v1/auth/*`
- `/api/v1/leave/*`
- `/api/v1/library/*`
- `/api/v1/notifications`
- `/api/v1/profile`
- `/api/v1/audit`

Expected errors include 400, 401, 403, 404, 409, and 500.

Realtime is expected for approval updates, library journey events, notifications, and dashboard changes.

OpenAPI is the source contract when implemented in the repository; generated Zod/client artifacts must be regenerated after contract changes.

## Implemented today

`packages/api-spec/openapi.yaml` is the actual source contract. As of Parent Leave Approval and Student Leave Request creation/viewing, it defines:

- `GET /api/v1/healthz`
- `POST /api/v1/leave-requests` — authenticated student creates a leave request for themselves (`201`, initial state `pending`)
- `GET /api/v1/leave-requests` — authenticated student's own leave requests, newest first
- `GET /api/v1/leave-requests/{leaveRequestId}` — authenticated owning student, OR authenticated parent/guardian, relationship-checked (404 for both nonexistent and unrelated/not-owned — anti-enumeration)
- `GET /api/v1/leave-requests/{leaveRequestId}/events` — same authorization/anti-enumeration shape as the GET above; returns the leave request's immutable approval-event timeline (`leave_approval_events`, ADR-015), oldest first, never including which specific parent/guardian/staff member acted (Approval History, Phase 4 Prompt 10 — see `apps/parent-mobile/docs/approval-history.md`). Extended to staff (`reception_warden`/`hostel_admin`/`super_admin`, AAL2-required, hostel-scoped) in Phase 3 Prompt 7B, for the Reception Dashboard's Parent Approval Session Workspace — see `apps/reception-dashboard/docs/parent-approval-session.md`
- `GET /api/v1/leave-requests/queue` — staff-only (`reception_warden`/`hostel_admin`/`super_admin`, AAL2-required): the Reception Dashboard's operational leave-request queue, hostel-scoped for `reception_warden`/`hostel_admin` and unscoped for `super_admin`, enriched with student roll number/full name and real hostel/room names (Reception Leave Request Queue, Phase 3 Prompt 7A — see `apps/reception-dashboard/docs/leave-queue.md`)
- `POST /api/v1/leave-requests/{leaveRequestId}/approve`
- `POST /api/v1/leave-requests/{leaveRequestId}/reject`

Both decision endpoints require a `biometricAssertion` in the request body and remain parent/guardian-only — a student can never approve, reject, or otherwise transition their own request (`docs/leave-approval-workflow.md`). `POST /leave-requests` never accepts a client-supplied student id; the authenticated caller's own resolved student profile is always used. All leave-request request bodies are strictly validated (`additionalProperties: false`) — an unrecognized field is rejected with `400`, not silently ignored. Errors use a consistent `{ error: { code, message } }` shape (409 responses additionally include `currentStatus`). Full design: `docs/leave-approval-workflow.md`.

**`/api/v1/audit` (Phase 5, Prompt 12 — Enterprise Audit Center)** is now implemented, as a privileged staff-only read path — not the SDD's original per-entity `/api/v1/audit` shape, but a hostel-scoped aggregate read over `audit_logs`:

- `GET /api/v1/audit` — staff-only (`reception_warden`/`hostel_admin`/`super_admin`, AAL2-required, `audit:view` permission): server-side paginated/filtered/sorted read over `audit_logs`, hostel scope resolved server-side by joining each row's polymorphic `entity_id` back to its owning domain table — see `apps/reception-dashboard/docs/audit-center.md` for the full resolution model. `audit_logs` itself has zero client-facing RLS by design; this route (via Fastify's service-role connection) is the only read path.
- `GET /api/v1/audit/statistics` — same authorization boundary; today's event counts by module, within the caller's own scope.

**`/api/v1/staff` (Phase 5, Prompt 13 — Identity & Access Administration Center)** — **super_admin-only** (AAL2-required, unscoped by hostel), not part of the SDD's original endpoint-family list at all:

- `GET /api/v1/staff`, `GET /api/v1/staff/statistics`, `GET /api/v1/staff/{staffId}` — the staff directory and its statistics.
- `POST /api/v1/staff` — provisions a new staff account via the Supabase Auth Admin API (invite email, no password ever generated/stored/returned by this backend).
- `PATCH /api/v1/staff/{staffId}/role`, `/hostel`, `/status` — role change, hostel reassignment, suspend/reactivate. Every mutation refuses to target the caller's own staff id (`403`) and refuses to leave zero active `super_admin`s (`409`) — genuinely concurrency-safe as of the QG-04 remediation (F-QG04-01): the invariant is re-checked under a real Postgres row lock inside the mutating transaction, not merely a pre-transaction count, proven against a real concurrent race (`docs/qg04-remediation.md`).
- `POST /api/v1/staff/{staffId}/reset-password` — triggers Supabase Auth's own recovery email via the Admin API.
- `POST /api/v1/staff/{staffId}/force-sign-out` — **not** an Admin API call (QG-04 remediation, F-QG04-02: the Admin API has no user-id-keyed "revoke every session" capability at all in the installed SDK — the original implementation was completely non-functional, live-reproduced as a raw `500`). Sets `staff.sessions_invalidated_before` to `now()`, enforced on every subsequent authenticated request by comparing it against the presented JWT's own `iat` claim — an already-issued session is rejected `401` on its next request; a genuinely new session obtained afterward is unaffected. See `docs/qg04-remediation.md` for the full root-cause/fix/verification record.

See `apps/reception-dashboard/docs/identity-admin.md` for the full design, including which capabilities (custom roles, per-user permissions, session listing, MFA reset, multi-hostel assignment) were deliberately deferred rather than built.

**`/api/v1/configuration` (Phase 5, Prompt 14 — Enterprise Configuration Center)** — staff-only, `hostel_admin`/`super_admin` (AAL2-required), not part of the SDD's original endpoint-family list at all:

- `GET /api/v1/configuration/domains` — the real, server-owned allow-list of recognized configuration domains.
- `GET /api/v1/configuration`, `GET /api/v1/configuration/{entryId}`, `GET /api/v1/configuration/statistics` — the configuration directory, hostel-scoped for `hostel_admin` (sees global entries plus only their own hostel's), unscoped for `super_admin`.
- `POST /api/v1/configuration/validate` — a stateless preview (never persists anything), sharing the exact same validation the real write path applies.
- `POST /api/v1/configuration` — creates an entry. A `hostel_admin` may only create a `"scope":"hostel"` entry naming their own hostel (`403` otherwise); never stores a secret (a key/domain resembling password/token/API key is rejected).
- `PATCH /api/v1/configuration/{entryId}` — updates value/description/active state. Optimistic concurrency: the caller's `expectedVersion` must match the entry's current version or the update is refused (`409`).

No runtime engine in this repository currently reads `configuration_entries` — every value is genuinely stored/validated/audited/editable, but documented explicitly as CONFIGURATION STORED — RUNTIME CONSUMPTION DEFERRED, not live-consumed. See `apps/reception-dashboard/docs/configuration-center.md`.

**`/api/v1/analytics` (Phase 6, Prompt 15 — Operational Intelligence & Executive Analytics Dashboard)** — staff-only, `hostel_admin`/`super_admin` (AAL2-required, `reports:view` permission — the same permission already granted to only these two roles since Prompt 3; `reception_warden`/`library_incharge` cannot reach any route below), not part of the SDD's original endpoint-family list at all. A pure read-model layer aggregating existing certified domains' own tables (`leave_requests`, `leave_approval_events`, `leave_exit_authorizations`, `movements`, `notifications`, `students`) — no new persistent table, no mutation of any kind:

- `GET /api/v1/analytics/overview` — KPI summary (student presence, leave, movement, notification counts) for an optional `dateFrom`/`dateTo` UTC ISO-8601 range (both-or-neither, `dateFrom <= dateTo`, max 90-day span, server-validated; defaults to the trailing 7 days when omitted). Hostel scope is never a request parameter — always resolved server-side from the caller's own staff identity.
- `GET /api/v1/analytics/leave-trend` — day-bucketed created/approved/rejected leave counts over the same date-range contract, zero-filled for every day with no events.
- `GET /api/v1/analytics/movement-trend` — day-bucketed and hour-of-day-bucketed (0–23, always all 24 present) hostel-return counts over the same date-range contract.

See `apps/reception-dashboard/docs/analytics-dashboard.md` for the full Source-of-Truth/Metric Matrix, including which metrics (hostel occupancy against capacity, Digital Library Pass activity, administrative session-level analytics, department/academic-year filters) were verified UNAVAILABLE/FUTURE rather than built, and why.

**`/api/v1/reports` (Phase 6, Prompt 16 — Enterprise Reporting Platform)** — staff-only, `hostel_admin`/`super_admin` (AAL2-required, `reports:view`/`reports:generate` permissions — both already granted to only these two roles since Prompt 3; the backend itself enforces by ROLE, identically to every other domain — the two permissions are a frontend UX-layer distinction only), not part of the SDD's original endpoint-family list at all. A read-oriented analytical layer — most reports reuse an already-certified domain's own service directly (Analytics/Emergency/Health/Audit), a minority are backed by fresh, narrowly-scoped read queries; no new operational table, no mutation of any operational data:

- `GET /api/v1/reports/catalog` — the fixed, server-owned report catalog (11 reports; one, Hostel Occupancy, honestly marked `unavailable` with a reason — no capacity data exists anywhere in the schema).
- `POST /api/v1/reports/{reportId}/preview` — a bounded (max 50 rows/page), server-validated preview. Every filter/field/sort value is validated against that specific report's own declared allow-list; an unrecognized value is rejected `400`. Records one execution-history entry on success.
- `GET /api/v1/reports/templates`, `POST /api/v1/reports/templates`, `PATCH /api/v1/reports/templates/{templateId}`, `DELETE /api/v1/reports/templates/{templateId}` — the caller's own saved, personal report configurations (never organization-wide/shared); ownership-scoped (`404` for another staff member's template, including for `super_admin`).
- `GET /api/v1/reports/history` — the caller's own recent report executions (which report, when, row count) — never a generated artifact (no PDF/XLSX/CSV file is ever produced by this platform).

No PDF/XLSX/CSV export, scheduled delivery, or external BI integration exists anywhere in this platform — deliberately out of scope. See `apps/reception-dashboard/docs/enterprise-reporting.md` for the full Source-of-Truth/Report Matrix, the Custom Report Builder design, and the complete list of deferred/unavailable capabilities.

No other endpoint family listed above (`/auth/*`, `/library/*`, `/notifications`, `/profile`) is implemented yet — do not assume they exist merely because the SDD specifies them (`docs/current-state.md`). This document itself remains a known-stale, partial record of the full API surface (many staff-facing endpoint families built since — Student Operations, Movement, Emergency, Health — are not listed above at all; see `docs/current-state.md` for the authoritative, up-to-date implementation history) — out of scope to fully rewrite here.
