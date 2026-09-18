# Enterprise Reporting Platform (Phase 6, Prompt 16)

Replaces Prompt 0.2's "Future scope" `ReportsPage` placeholder and the interface-only `ReportService` stub with a real, read-only, standardized reporting workspace at `/reports`. This is a **read-oriented analytical layer**, not a new business-transaction engine — it introduces no new operational table, and every report is derived from an already-certified domain's own authoritative data (either by reusing that domain's own service directly, or via a fresh, narrowly-scoped read query over its existing tables).

## 1. Architecture summary

```
Reception Dashboard (ReportsPage)
  -> features/reports/{useReportCatalog,useReportPreview,useReportTemplates,useReportHistory}
  -> services/reports/ReportService (thin transport wrapper)
  -> generated client (Orval, from packages/api-spec/openapi.yaml)
  -> Fastify GET/POST /api/v1/reports/*  (apps/api/src/routes/reports.ts)
  -> ReportsService (apps/api/src/domain/reports/service.ts)
       -> AnalyticsService.getOverview()        (operational_summary — Prompt 15, reused verbatim)
       -> EmergencyService.list()               (emergency_incident — Prompt 10, reused)
       -> HealthService.list()                  (health_operations — Prompt 11, reused)
       -> AuditService.list()                   (audit_activity / administrative_user_activity /
                                                   configuration_change — Prompt 12, reused,
                                                   same protected access path, never bypassed)
       -> ReportsRepository (new, focused queries)
            -> student_movement, parent_approval, leave_authorization, notification_activity
       -> ReportsRepository (template/history CRUD, new tables)
  -> Fastify's service-role Postgres connection (bypasses RLS by design,
     ADR-006/ADR-014 — identical to every other privileged staff read)
```

No route in `routes/reports.ts` performs a mutation against any operational table. The only writes this platform performs are to its own two new, minimal, purely-administrative tables (`report_templates`, `report_executions`) — see §9.

## 2. Reconnaissance findings

| Assumption | Status |
|---|---|
| `/reports` route, nav item, `reports:view` permission already exist | **VERIFIED** — pre-wired since Prompt 0.2/3, `ReportsPage`/`ReportService` were placeholders only |
| `reports:generate` permission already exists | **VERIFIED — previously undiscovered.** Declared in `permissions.ts`/granted in `policy.ts` since Prompt 3, but never wired to any route until this prompt. Used here for the "active" preview/generate/save operation, `reports:view` for browsing (catalog/templates/history) — a UX-layer distinction only; the backend enforces by ROLE (`requireStaffRole`), identically to every other domain |
| A reporting query/aggregation layer already exists | **PARTIALLY VERIFIED** — Prompt 15's Analytics domain exists and is reused directly for `operational_summary`; no other reporting-shaped query existed anywhere |
| Emergency/Health/Audit already have list()-shaped, hostel-scoped, paginated services | **VERIFIED** — reused directly, zero duplicated query logic |
| `movements`/`notifications`/`leave_approval_events` have a bounded, filtered, paginated list query | **VERIFIED FALSE** — none existed; new, focused queries were added in `domain/reports/repository.ts` |
| `hostels`/`rooms` have a capacity column | **VERIFIED FALSE** (re-confirmed, matching Prompt 15's identical finding) — Hostel Occupancy Report is UNAVAILABLE |
| `students` has department/program/academic-year/category fields | **VERIFIED FALSE** — no such filter/field exists anywhere in the Custom Report Builder |
| A session-listing capability exists for "active sessions" | **VERIFIED FALSE** (re-confirmed, matching QG-04's finding) — Administrative User Activity Report reports staff-auth audit EVENTS only, never a session list |

## 3. Source-of-Truth / Report Matrix

| Report | Source | Status | Scope | Notes |
|---|---|---|---|---|
| Operational Summary | `AnalyticsService.getOverview()` | IMPLEMENTED | Hostel-scoped/unscoped | Verbatim reuse of Prompt 15's formulas — never a second calculation |
| Leave Authorization Report | `leave_requests` (new query) | IMPLEMENTED | Hostel-scoped/unscoped | DigiHostel lifecycle only — no SAP field exists or is fabricated |
| Parent Approval Report | `leave_approval_events` (new query) | IMPLEMENTED | Hostel-scoped/unscoped | Event-sourced (notified/responded/escalated/expired/manual_override); never exposes actor identity |
| Student Movement Report | `movements` (new query) | IMPLEMENTED | Hostel-scoped/unscoped | Only `hostel_return` movement type exists |
| Emergency Incident Report | `EmergencyService.list()` | IMPLEMENTED | Hostel-scoped/unscoped | Reused unchanged; additive optional `dateFrom`/`dateTo` added to `EmergencyListInput` (see §11) |
| Health Operations Report | `HealthService.list()` | IMPLEMENTED | Hostel-scoped/unscoped | Reused unchanged; same additive date-range extension |
| Notification Activity Report | `notifications` (new query) | IMPLEMENTED | Hostel-scoped/unscoped | The real, persistent ADR-018 table — not the Notification Center (no persistent backing, unchanged since Prompts 6/11) |
| Audit Activity Report | `AuditService.list()` | IMPLEMENTED | Hostel-scoped/unscoped | Reused unchanged — same protected `audit_logs` access path (Prompt 12), never bypassed |
| Administrative User Activity Report | `AuditService.list({modules:["staff-auth"]})` | IMPLEMENTED | Hostel-scoped/unscoped | Staff-auth EVENTS only — never an active-session list (none exists) |
| Configuration Change Report | `AuditService.list({entityTypes:["configuration_entries"]})` | IMPLEMENTED | Hostel-scoped/unscoped | The audit trail of changes, not current configuration state (that already has its own page) |
| Hostel Occupancy Report | — | **UNAVAILABLE** | — | No capacity column exists anywhere in the schema (architectural gap, not a missing query) |

## 4. Report Definition / Metric Contract

Every report is a fixed, server-owned `ReportDefinition` (`apps/api/src/domain/reports/service.ts`'s `REPORT_DEFINITIONS`): id, name, category, description, status, `availableFields`, `availableFilters` (each with its own real, fixed `options` for a `multi_select` filter — the exact enum values that domain's own schema defines, never invented), `sortFields`, `defaultSortField`, `isPaginated`. This is the ONE source both the catalog endpoint and every preview/validation call reads from — a client cannot request a field, filter, or filter value the definition doesn't declare (`routes/reports.ts`'s `validateFiltersAgainstDefinition`/`validateSelectedFields`, enforced server-side, not merely documented).

Date semantics: every date-filterable report reuses Prompt 15's own `MAX_ANALYTICS_RANGE_DAYS`(90)/`DEFAULT_ANALYTICS_RANGE_DAYS`(7) contract directly (re-exported from `domain/analytics/types.ts`) — both bounds inclusive, UTC ISO-8601, both-or-neither, max 90-day span, defaulting to the trailing 7 days when omitted. One consistent server-side date interpretation platform-wide (§11's own explicit requirement) — never a second, independently-defined date contract.

## 5. Custom Report Builder design

Field **selection** over a fixed, server-owned report definition — never a dynamic query engine. The flow: select a report from the catalog → the builder renders that report's own `availableFilters` (date range + multi-select chips) and `availableFields` (checkboxes, default: all) → click Generate Preview → review the bounded result → optionally Save as Template. No route anywhere accepts a raw SQL fragment, an arbitrary table/column name, or a client-defined join. Grouping is **DEFERRED entirely** — no dynamic `GROUP BY` is exposed by any route; each row-list report returns row-level data, sorted by that report's own fixed `sortFields` list (currently a fixed default sort is applied server-side; a client-selectable sort direction exists at the type level but the UI does not yet expose a sort control — a genuine, honestly-scoped gap, not a fabricated capability).

## 6. Reusable filter architecture

Two filter `type`s: `date_range` (two native date inputs, rendered by `ReportFilterPanel`) and `multi_select` (a toggleable chip group, mirroring `DateRangeFilter`'s established `aria-pressed` button-group pattern from Prompt 15). Every accepted value for a `multi_select` filter is a member of that filter's own server-declared `options` array — the frontend cannot construct, and the backend will reject (`400`), any other value. **Hostel scope is never a filter** — no route accepts a `hostelId` parameter of any kind; scope is always resolved server-side from the caller's own authenticated staff identity (`ReportsProfile.hostelId`, from the standard staff-auth resolution path).

## 7. Preview architecture

`POST /reports/{reportId}/preview` returns a bounded `ReportPreviewResult`: `columns` (only the selected — or, if none selected, every available — field), `rows` (the server's own paginated page, `pageSize` capped at 50), `total` (a real `COUNT(*)`-equivalent — the honest, calculable dataset size; no byte-size "estimated export size" is ever fabricated, since no export capability exists to measure), and, for the single-row Operational Summary report only, `summary` (the `AnalyticsOverview` object, with `columns`/`rows` empty). Never loads an unbounded dataset into the browser.

## 8. Snapshot semantics

Each preview carries a `generatedAt` timestamp — the moment that specific query executed. This is the closest honest approximation of a "snapshot timestamp" this architecture offers: a consistent, single-request read, not a formal immutable database snapshot or a versioned point-in-time read (no such capability exists anywhere in this platform). A future formal snapshot/versioning system is a genuine architectural extension point, not implemented here.

## 9. Template & history storage — new schema (migration `0024`)

Two new, minimal tables (`packages/db/src/schema/reports.ts`), mirroring `configuration_entries`'s own precedent exactly — genuinely new schema (no existing table represents either concept), deliberately small (not the larger multi-table shape the prompt's own text merely lists as a *possibility*):

- **`report_templates`** — a staff member's own saved, reusable report configuration (`reportId` + `filters` + `selectedFields` + `name`, plus an `isFavorite` flag doing double duty as "favourites" so a second table isn't needed for that structurally identical concept). Personal — scoped by `staff_id` alone, never organization-wide/shared (§15's explicit instruction).
- **`report_executions`** — a minimal execution-history record (which report, who, their hostel scope at that time, a filter summary, row count, when) — one row per successful preview. Deliberately distinct from a template (a configuration, not an event) and from a generated artifact (**no PDF/XLSX/CSV file is ever produced by this platform** — there is nothing to reference). `audit_logs` was deliberately NOT reused for this: report generation is a READ, not a mutation, and `audit_logs.entity_id` is `NOT NULL` with no natural "report definition" entity to reference.

**RLS: zero policies for any client role on either table** — mirrors `audit_logs`'/`configuration_entries`' own established pattern exactly; only Fastify's service-role connection reads/writes them. Verified via a new adversarial pgTAP suite, `supabase/tests/database/28_prompt16_enterprise_reporting_rls.sql` (10 assertions: even the seeded row's own `super_admin` owner cannot SELECT/INSERT/UPDATE/DELETE via a direct authenticated PostgREST session; neither can a different hostel_admin or an anonymous session) — full suite now **378/378**.

## 10. Export-ready architecture

**Not implemented, by explicit design.** No PDF/XLSX/CSV generation, no "Download" button of any kind exists anywhere in this UI — Prompt 16's own scope boundary explicitly excludes actual file generation. The `ReportPreviewResult` contract (`columns`+`rows`, a stable, typed shape) is the interface a future export adapter would consume — the architecture permits `Report Definition → Query/Preview Dataset → Export Adapter` without this prompt building the adapter. Scheduled report delivery, email distribution, and cloud storage are equally unbuilt — not even scaffolded with dead UI.

## 11. A genuine, additive extension found and applied to two certified modules

Reconnaissance found `EmergencyListInput`/`HealthCaseListInput` had no date-range filter at all — `EmergencyService.list()`/`HealthService.list()` could not be reused for a *reporting* consumer without one. Rather than duplicating either domain's entire query logic inside the Reports repository, an optional `dateFrom`/`dateTo` pair was added to each input type, applied identically to the existing precedent `HealthCaseListInput.studentId` already established (Prompt 11 closure — an additive, opt-in filter, applied AFTER the existing hostel-scope check, with zero behavior change for either domain's own existing callers, the EOC/Health Operations Center queues). This is a minimal, precedent-following extension, not a redesign — see `apps/api/src/domain/emergency/types.ts`/`apps/api/src/domain/health/types.ts` for the exact doc comments recording this.

A second, similarly minimal finding: `AUDIT_ENTITY_TYPES` (`domain/audit/types.ts`) was missing `"configuration_entries"` — a value `domain/configuration/repository.ts` was genuinely already writing to `audit_logs`, simply never added to the Audit Center's own declared allow-list. Added as a one-line, purely additive extension (the underlying query already correctly filters on any string value; this only widens what the type-level/Zod validation accepts), needed so the Configuration Change Report could filter `AuditService.list()` precisely rather than relying on the coarser `module: "other"` bucket every unclassified action falls into.

A third, unrelated but genuinely pre-existing defect was found and fixed during this task's own live browser verification: the shared `Breadcrumb.tsx` component (Prompt 0.2 scaffolding) keyed its list items by `segment.label` — safe for every previously-built page, but this page's own breadcrumb trail legitimately contains two segments with the identical display text ("Reports" the nav group heading, "Reports" the nav item), which produced a real React duplicate-key warning the instant this page was actually rendered. Fixed by keying on array index instead (safe for a trail that is always rendered fresh, in a fixed order) — a one-line, non-behavior-changing correction.

None of these three findings required redesigning the certified module they touched, and none was silently absorbed without comment — each is recorded here and in its own file's doc comment.

## 12. Security summary

Full existing chain, unchanged and reused: Password → TOTP MFA → AAL2 (`requireAal2()`) → Staff Identity → Role (`requireStaffRole("hostel_admin","super_admin")` — `reception_warden`/`library_incharge` denied `403`, verified by test) → Permission (`reports:view`/`reports:generate`, frontend UX layer only) → Hostel Scope (server-resolved; no route accepts a hostel parameter of any kind) → Backend Authorization → RLS (N/A for the reused domains' own service-role reads; zero-policy for the two new tables, verified by pgTAP). Every filter/field/sort value is validated server-side against that specific report's own declared allow-list — an unrecognized value is rejected `400`, never silently accepted or fabricated. Templates are ownership-scoped: `updateTemplate`/`deleteTemplate` match on `(templateId, staffId)` together, so one staff member's template is invisible and unmutable to every other staff member, including `super_admin` (no cross-staff template management exists — a deliberate, minimal-privilege choice, since no product requirement asked for one).

## 13. Privacy / data minimization

Every report is a list of counts/records already exposed by its underlying certified domain's own existing authorization boundary — no new disclosure surface is introduced. Parent Approval Report never exposes which specific parent/staff member acted (matches `LeaveApprovalEventView`'s established privacy discipline). Health/Emergency reports reuse those domains' own already-minimized `ListItemView` shapes (no diagnosis/prescription/clinical-document field exists in either domain's schema, so none can leak here). Notification Activity Report reports only aggregate per-notification status (queued/sent/delivered/failed) — never a phone number or push-token value.

## 14. Loading / error / empty states

Independently handled per concern: catalog loading (skeleton), report selection (an unselected state with clear instructions), preview generation (loading → success/empty/error, `ChartCard`/`ErrorState`/`EmptyState`-equivalent components reused from the existing UI library), templates panel (its own loading/error/empty), history panel (its own loading/error/empty). An `unavailable` report never shows filters or a Generate action — only its honest reason, `role="alert"`. A date range exceeding 90 days, or a filter value outside a report's declared allow-list, produces a real, distinctly-surfaced `400` with a retry action — live-verified against the real running backend.

## 15. Accessibility

**Code-level (implemented)**: every filter/field control has a real associated label (native `<label for>` via `FormField`, or `aria-label` on chip groups); multi-select chips use `aria-pressed`; the unavailable-report notice uses `role="alert"`; the field-selector checkboxes are wrapped in a `<fieldset>`/`<legend>`; the result table is a real semantic `<table>` (reused `Table` primitive) with `scope="col"` headers.

**Live assistive-technology verification: NOT PERFORMED.** No screen reader was used against the rendered page — recorded explicitly, not implied by the code-level review.

## 16. Performance

**Architectural (implemented)**: every report is DB-side aggregated/filtered/paginated (`LIMIT`/`OFFSET` with a `pageSize` hard-capped at 50); the 90-day maximum date-range span bounds worst-case aggregation cost; no report ever pulls an unbounded row set to the browser. No materialized view, cache, or background worker was introduced — none was demonstrated necessary by profiling.

**Measured**: informal observation during live browser verification showed sub-second response times against the local development dataset; no systematic query-plan profiling (`EXPLAIN ANALYZE`) was performed.

**Load testing: NOT PERFORMED.** Recorded explicitly, kept separate from the architectural/measured claims above.

## 17. Testing summary

- **Backend targeted**: `apps/api/src/routes/reports.test.ts` — 30 tests (auth/AAL2/role matrix on catalog and preview, unavailable-report `409`, reportId path/body mismatch, forged filter value/key/selectedField rejection `400`, default-date-range application, malformed-date/over-90-day-range rejection, forged extra body field `.strict()` rejection, execution-history recording with the caller's own real hostel scope, full template CRUD including duplicate-name `409` and ownership-scoped `404`).
- **Backend integration** (real Postgres): `apps/api/src/domain/reports/repository.integration.test.ts` — 10 tests (a genuine full leave-cycle fixture for Leave Authorization/Parent Approval/Student Movement reports, hostel isolation, forged staffId, empty-period real zeros, full template create/list/update/delete/duplicate-name lifecycle, execution recording+history).
- **Database security**: `supabase/tests/database/28_prompt16_enterprise_reporting_rls.sql` — 10 pgTAP assertions proving zero client-role access to either new table, including the seeded row's own owner.
- **Frontend**: `ReportsPage.test.tsx` (9 tests — catalog rendering, scope indicator, report selection, unavailable-report honesty, Generate Preview wiring, Save-as-Template enablement, deferred-capabilities note), `ReportFilterPanel.test.tsx` (5 tests), `ReportFieldSelector.test.tsx` (4 tests — including the "empty selection means all, first deselection must materialize the full list" edge case this component's own logic has to get right).
- Full workspace regression, pgTAP, typecheck/lint/format/build: see the Prompt 16 final report for exact pass/fail counts at time of delivery.

## 18. Deferred / unavailable capabilities

| Capability | Status | Reason |
|---|---|---|
| Hostel Occupancy Report | UNAVAILABLE | No capacity column exists anywhere in the schema |
| PDF/XLSX/CSV export | OUT OF SCOPE | Explicitly excluded by Prompt 16 §3/§16 — no UI control exists for it |
| Scheduled report delivery / email distribution | OUT OF SCOPE | Explicitly excluded |
| Cloud report storage / external BI integration | OUT OF SCOPE | Explicitly excluded |
| Organization-wide shared templates | DEFERRED | No product requirement demonstrated a need beyond personal templates; the schema (`report_templates.staff_id`) can be extended later without a breaking change |
| Dynamic GROUP BY / custom aggregation in the builder | DEFERRED | Would require accepting a more open-ended query specification than this platform's "field selection over a fixed report" design permits without real risk of arbitrary-query injection |
| Client-selectable sort direction in the UI | DEFERRED | The type/route-level contract supports it (`sortField`/`sortDir`); no UI control was built to set it (a report's own fixed default sort is always applied) |
| Live AT (screen reader) verification | NOT PERFORMED | Recorded honestly, not claimed |
| Load testing | NOT PERFORMED | Recorded honestly, not claimed |

## 19. Developer extension guidelines

To add a new report reusing an existing domain's own service: add a `ReportDefinition` entry to `REPORT_DEFINITIONS` (`domain/reports/service.ts`) naming its real fields/filters (derived from that domain's own `ListItemView`/enum types — never invented), add a `case` to `preview()`'s switch calling that service, and map its result fields onto the definition's own field ids. To add a new report backed by a fresh query: add the query to `ReportsRepository`, reusing the established `scopeCondition()` hostel-scope pattern. Never add a report field or filter value that isn't traceable to a real column/enum in the underlying schema — if the data doesn't exist, classify the report `unavailable` with an honest `unavailableReason` instead (matching the Hostel Occupancy Report's own precedent).
