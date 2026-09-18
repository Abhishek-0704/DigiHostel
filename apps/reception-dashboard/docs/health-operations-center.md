# Health Operations Center (Phase 4, Prompt 11)

## 1. Purpose & Reconnaissance

Replaces Prompt 0.2's "No backend/data model exists yet" placeholder (`HealthPage.tsx`/`HealthService.ts`/`src/features/health/README.md`). Reconnaissance before implementation covered: the existing schema (`security_incidents`, `security_incident_events`, `students`, `staff`, `hostels`, `rooms`), the Emergency Operations Center's architecture (Prompt 10, the most directly relevant precedent), the RLS/audit/notification/realtime conventions those prompts established, and every existing health/medical terminology hit in the repository (all under `packages/db/src/schema/audit.ts` and `enums.ts` — the Prompt 10 doc comments that speculated the future "Health Alerts" module might reuse `security_incidents` further).

**Decision: a NEW table pair (`health_cases`/`health_case_events`), not a further extension of `security_incidents`.** This is a deliberate departure from the path Prompt 10's own doc comments anticipated, made after evaluating it concretely:

- The EOC's own 5-state `open → acknowledged → in_progress → resolved → closed` lifecycle already occupies `security_incidents.status` for ACUTE, staff-attested incidents. A health case's real lifecycle (new → acknowledged → monitoring ⇄ awaiting_update → resolved/discharged → closed, plus `cancelled`) is materially different — longer-lived, with a genuine monitoring/awaiting_update oscillation and an admission/discharge concept the EOC has no equivalent for.
- `security_incident_type` already has a `medical` value, reserved for the EOC's own acute "Report Emergency" capability. Reusing it for Health Operations Center cases would make `incident_type = 'medical'` ambiguous between "an acute emergency" and "an ongoing medical case" — two different operational concerns with two different owners and two different response expectations.
- Sharing one `status` enum/column between two unrelated state machines invites exactly the kind of cross-domain query/authorization bugs this project's own history (F-05, F-05A, F-QG02-01) has repeatedly found and fixed the hard way.

What IS reused, deliberately, is the EOC's own **pattern**: immutable append-only timeline table, forged-actor/forged-assignee RLS defense, hostel-scoped `is_reception_for_student`/`is_hostel_admin_for_student` helpers, conditional-`UPDATE ... WHERE status = from` transitions, and `security_incident_severity` itself — reused directly as `health_cases.severity`'s column type, since the same critical/high/medium/low/informational vocabulary applies with no product reason for a second, competing concept.

## 2. Data Model

```
health_cases (NEW)
  id, student_id, category, severity, status, description,
  assigned_staff_id, admitted_at, resolved_at, discharged_at,
  closed_at, cancelled_at, created_at

health_case_events (NEW — operational timeline, mirrors security_incident_events)
  id, case_id, event_type, actor_staff_id, note, occurred_at
```

- `category` (`health_case_category`, new enum): `hospital_admission`, `medical_observation`, `emergency_admission`, `outpatient_visit`, `discharge`, `medical_follow_up`, `accident`, `other_medical_event`.
- `severity`: reuses `security_incident_severity` (`critical`/`high`/`medium`/`low`/`informational`) directly — no new enum.
- `status` (`health_case_status`, new enum): `new`, `acknowledged`, `monitoring`, `awaiting_update`, `resolved`, `discharged`, `closed`, `cancelled` — every value is wired to a real, server-enforced transition (§3); none is speculative.
- `admitted_at`: set automatically, server-side, at creation when `category` is `hospital_admission` or `emergency_admission` — a real, honest fact ("reported as an admission at this time"), never a fabricated clinical confirmation workflow.
- `health_case_events.event_type` (new enum): `created`, `acknowledged`, `monitoring_started`, `awaiting_update`, `update_received`, `note_added`, `resolved`, `discharge_recorded`, `closed`, `cancelled` — one value per real transition/note, matching `movementType`'s own established "no enum value without a real producer" discipline.
- No `library_incharge` policy exists on either table at all (not narrowed, as with the EOC — simply absent; that role has even less product reason to manage a medical case than a security incident).

## 3. Medical Case Lifecycle

```
new ─┬─→ acknowledged ─→ monitoring ⇄ awaiting_update
     └─→ cancelled              │
                                 ├─→ resolved ─┐
                                 └─→ discharged ┴─→ closed
```

Server-authoritative transition matrix (`HEALTH_CASE_TRANSITIONS`, `apps/api/src/domain/health/types.ts`):

| Action | From | To | Event written |
|---|---|---|---|
| `acknowledge` | `new` | `acknowledged` | `acknowledged` (self-assigns the caller) |
| `cancel` | `new` | `cancelled` | `cancelled` |
| `startMonitoring` | `acknowledged` | `monitoring` | `monitoring_started` |
| `markAwaitingUpdate` | `monitoring` | `awaiting_update` | `awaiting_update` |
| `resumeMonitoring` | `awaiting_update` | `monitoring` | `update_received` |
| `resolve` | `monitoring` | `resolved` | `resolved` |
| `discharge` | `monitoring` | `discharged` | `discharge_recorded` |
| `close` | `resolved` **or** `discharged` | `closed` | `closed` |

Enforced via a conditional `UPDATE ... WHERE status IN (from)` (the same deterministic, concurrency-safe pattern `DrizzleEmergencyRepository.transition()` established, generalized to accept `close`'s two valid starting states) — an out-of-order or duplicate transition affects zero rows and returns 409, never silently succeeds or produces a duplicate event. Notes (`note_added`) may be added at any status except `closed`/`cancelled`. **Invalid transitions** (e.g. `new → resolve`, skipping `acknowledged`/`monitoring`; re-acknowledging an already-`acknowledged` case; closing a case still `monitoring`) are uniformly rejected with 409 — live-verified (§8) and covered by both unit and real-Postgres integration tests. **Concurrency**: two simultaneous `acknowledge` calls on the same case — exactly one succeeds, the other receives 409, live-verified with a genuine two-request race (real Postgres, `repository.integration.test.ts`). Every transition and note writes both a `health_case_events` row (the UI's own timeline) and an `audit_logs` row (service-role-only, compliance-grade — `audit_logs` remains the ONE audit system; `health_case_events` is not a second one).

## 4. Health Dashboard Design

`HealthPage.tsx` (`/health`) composes the existing `ContentLayout` shell exactly like every certified page since Prompt 4:

- **Statistics** (`HealthStatisticsStrip`, `GET /health-cases/statistics`): Active, Critical, New, Monitoring, Awaiting Update, Admitted Today, Discharged Today — every number a fresh server-derived aggregate over the caller's own scope, never computed from the currently loaded page.
- **Queue** (`HealthCaseTable`): Case ID (linked via Action), Student Name/Roll Number, Hostel/Room, Medical Category, Priority, Current Status, Admission Time, Latest Update (server-derived: the most recent timeline event's timestamp, or the case's own creation time), Action.
- **Filters/search/sort** (`HealthFilterBar`, `SearchInput`, sort select): category/severity/status chip filters + "Active only" toggle, server-side pagination/filtering/sorting/search — mirrors `EmergencyPage`'s established pattern, never a client-side filter over a full-table fetch.
- **Operational alerts**: surfaced through the queue/statistics/realtime themselves (§6) — no redesign of the Notification Center.

## 5. Medical Timeline Design

`health_case_events` mirrors `security_incident_events`'/`leave_approval_events`'s established shape exactly: one immutable row per lifecycle transition or note, RLS-scoped through the parent `health_cases` row's own student/hostel relationship, no UPDATE/DELETE policy for any role (live-verified, §8). Event types are exactly the 10 real transitions/notes this domain performs (§2/§3) — no fabricated `parent_notified`/`hospital_update`/`physician_reviewed` event exists anywhere, since no real producer for any of those exists in this repository. Ordering is server-authoritative (`ORDER BY occurred_at ASC`); actor identity (`actorStaffName`) is included — this is a staff-only operational surface end to end, so showing which colleague acted carries none of the disclosure concern `LeaveApprovalEventView` guards against on student/parent-facing views.

## 6. Student Operations Integration Summary

The Health Operations Center never duplicates student/guardian data. `HealthCaseListItemView`/`HealthCaseDetailView` carry only minimal display fields (name/roll number/hostel/room) — the detail page's "Open Student Profile" button navigates to the existing, already-certified Student Operations Center for leave context and everything beyond §16.2's own now-implemented Parent/Guardian section. Case **creation** reuses `useStudentProfile` (Prompt 8) via `StudentReportHealthCasePage.tsx`, reached from `StudentProfilePage.tsx`'s own real "Report Health Case" quick action (replacing the "Health Alert" disabled placeholder) — no second student search/lookup path anywhere.

**Update (closure pass)**: the Case Detail page's own "Parent / Guardian" section (§16.2) ALSO reuses `useStudentProfile` directly, rather than only linking out to the Student Profile page — see §16.2 for the full evidence and reasoning. This is still the same single student-data path Prompt 8 established; it is now consumed from two pages instead of one, never duplicated into a second query/service.

## 7. Notification Integration Summary

**Not wired — verified deferred, same conclusion as the EOC (Prompt 10) and the Notification Center itself (Prompt 6), re-verified fresh for this closure pass rather than assumed unchanged.** The `notifications` table has zero staff RLS grant and an enum that does not model a staff recipient (`recipientType ∈ {parent, student}` only); `apps/reception-dashboard/src/services/notifications/NotificationService.ts`'s `list()` is coded to always return `[]`, and `NotificationContext.tsx` exposes no method to inject/create a notification at all — only lifecycle transitions (`markAsRead`/`acknowledge`/`dismiss`/`archive`) over an already-populated array. There is genuinely no producer capability, client-side or server-side, for any domain module (Health, Emergency, or otherwise) to create a staff-facing notification today. See §16.1 for the full evidence trail and the formally documented future producer boundary.

## 8. Security Summary

Every `/health-cases*` route requires: authentication (`app.authenticate`) → AAL2 (`requireAal2()`) → role (`requireStaffRole("reception_warden", "hostel_admin", "super_admin")`, reusing the already-declared `health:manage` permission, granted since Prompt 3, never previously wired — `library_incharge` is never in the allowed-role list) → hostel-scope (application-layer `scopeCheck()`, since Fastify's connection is service-role and bypasses RLS by design) → Supabase RLS (defense-in-depth for a direct client). **F-QG02-01 lesson applied from the start**: RLS `WITH CHECK` on `health_cases_all_reception`/`_all_hostel_admin` independently requires a non-null `assigned_staff_id` to equal the caller's own resolved staff id.

**Live adversarial verification** (`prompt11_security_verify.py`, real password+TOTP+AAL2 sessions, no forged JWTs): unauthenticated → 401; AAL1 → 403; wrong role (`library_incharge`) → 403; cross-hostel read/acknowledge → 404 (anti-enumeration — identical shape for "doesn't exist" and "exists but out of scope"); duplicate acknowledge → 409; out-of-order resolve (skipping `monitoring`) → 409; a direct PostgREST cross-hostel `UPDATE` → silently filtered (0 rows), independently confirmed unchanged via a service-role re-read; a direct PostgREST forged `assigned_staff_id` (even from the correct hostel) → `403`/`42501` RLS violation; a direct PostgREST forged `actor_staff_id` on a `health_case_events` INSERT → `403`/`42501`. All persisted state was independently re-read via the service-role connection to confirm no unauthorized write occurred. Data minimization: guardian/parent contact is never duplicated into this domain's own views, logs, or realtime payloads; no diagnosis/prescription/treatment-plan/lab-result field exists anywhere in the schema — this is deliberately an operational coordination tool, not an EHR (per this task's own explicit Rule 5).

## 9. Loading & Error Strategy

Dashboard/queue/detail/timeline skeletons (existing `Skeleton` primitive); honest empty states ("No active medical cases" / a distinct "No cases match this search" once a query is entered); honest error states (`ErrorState`, permission-denied via `RequirePermission`/`Can`, cross-hostel via the identical 404 anti-enumeration shape, realtime-unavailable banner on the queue page); mutation errors surfaced inline (`role="alert"`) next to the action/note that failed, never a false success state.

## 10. Accessibility Summary

Built entirely on existing accessible primitives: `StatusBadge` (icon + text, never color-only — every severity/status tone pairs a glyph with a label), `ConfirmationDialog` (native `<dialog>`, focus-managed) before every consequential transition and before reporting a case, semantic `<table>` (via the existing `Table` primitive), labeled form fields (`aria-label`s on the note textarea and description field), keyboard-operable chip filters (`aria-pressed`). No new accessibility pattern was introduced.

## 11. Performance Summary

Server-side pagination/filtering/sorting throughout (`GET /health-cases`); debounced search (300ms, `useDebouncedValue`); realtime-driven invalidation via two dedicated, narrowly-scoped subscriptions (§12) rather than polling; the queue table's column-based `Table` primitive does not preclude future virtualization (no per-row heavy computation, stable row keys).

## 12. Realtime

`health_cases` and `health_case_events` both join the `supabase_realtime` publication directly (migration `0018_health_operations_center.sql`), the same established pattern F-08/F-QG02-04/Prompt-9/Prompt-10 already used. Two dedicated hooks:

- `useHealthCaseQueueRealtime` — unfiltered subscription on `health_cases`, mirrors `useEmergencyQueueRealtime`.
- `useHealthCaseDetailRealtime` — filtered to one case (`id=eq.<id>` / `case_id=eq.<id>`) across both tables, mirrors `useEmergencyDetailRealtime`.

Both always invalidate-and-refetch the authoritative REST query — never a client-side merge of the raw realtime payload. **Independent-client live verification performed** (temporary `_health_realtime_probe.mjs`, deleted after use, confirmed absent via `git status`): two genuinely authenticated `@supabase/supabase-js` clients (`reception1@example.test`/Kalinga, `reception2@example.test`/Utkal, no forged tokens) subscribed via `postgres_changes`; a real `acknowledge` transition triggered through the running API produced BOTH a `health_cases` UPDATE and a `health_case_events` INSERT delivered to the Kalinga subscriber with payloads matching the persisted row exactly, while the Utkal subscriber received nothing for the same event — confirming RLS governs realtime delivery, not merely REST responses.

## 13. Future KIIMS Integration Strategy

**Not implemented — by design, per this task's own explicit instruction.** No official KIIMS/hospital-management-system API is known to exist or be authorized for use; nothing was scraped, faked, or assumed. The conceptual future integration boundary:

- **Expected shape**: a dedicated `domain/health/externalIntegration.ts`-style module (not created — no real producer exists yet to justify the abstraction) that would translate an inbound KIIMS event (webhook or scheduled sync) into the SAME `health_cases`/`health_case_events` writes this prompt's own repository already performs — reusing `HealthRepository.transition()`/`addNote()`, never a parallel state machine.
- **Authentication boundary**: any real integration would need its own service-to-service credential (e.g. a signed webhook secret or mutual TLS), verified before any write — never trusting an inbound payload's claimed identity.
- **Idempotency**: KIIMS's own event/message id would need to be recorded (a new nullable column, e.g. `external_event_id`, added additively, mirroring how `security_incidents`/`health_cases` were themselves extended additively) so a redelivered webhook cannot double-write.
- **Validation boundary**: inbound category/severity would need mapping to this domain's own controlled vocabulary (§2) — never accepting an arbitrary external string directly into `category`/`status`.
- **Event mapping**: an inbound "admission confirmed" would map to setting `admitted_at` (if not already set) and writing an event — not a new status, since `monitoring` already covers "actively tracked, currently admitted."
- **Failure handling**: matches this codebase's own established worker-retry conventions (`apps/api/src/workers/notificationWorker.ts`) rather than a bespoke scheme.
- **Why not implemented now**: building this abstraction with no real producer to integrate against would be exactly the "fake external integration" this task's own Rule 3 forbids — it would either call an imaginary endpoint or sit as untested, unexercised code with no way to verify it actually works.

## 14. Parent Application Preparation

No SMS, push notification, parent approval, or phone-call integration was implemented — none of that infrastructure is genuinely certified for this domain (the Parent App has no health-case screen, and no server-side push/SMS delivery mechanism reads from `health_cases`). The domain's own event types (§2) are already shaped as discrete, nameable facts (`admission_recorded` implicitly via `admitted_at`, `discharge_recorded`, `resolved`, `closed`) that a FUTURE parent-notification producer could subscribe to via the same `health_case_events` table this prompt already writes — no interface was fabricated for a consumer that doesn't exist.

## 15. Testing Summary

- **Backend (original Prompt 11)**: 26 route tests (`routes/health-cases.test.ts`, full security matrix A–N adapted to this domain's own 8-action state machine) + 15 service unit tests (`domain/health/service.test.ts`) + 11 real-Postgres integration tests (`domain/health/repository.integration.test.ts`, including a genuine concurrency race and both the resolve-lifecycle and discharge-lifecycle full paths) = 52 tests.
- **Backend (closure pass)**: +3 route tests (`studentId` filter: in-scope, cross-hostel zero-results, non-UUID rejected) + 2 real-Postgres integration tests (`studentId` filter proven hostel-scoped against real seeded data) = **57 backend tests total**.
- **Database**: 26 pgTAP assertions (`21_health_operations_center_rls.sql`) + 2 realtime-publication assertions (`11_realtime_publication.sql`) = 28 total (full suite: **274/274**, unaffected by the closure pass — no schema/RLS change).
- **Frontend (original Prompt 11)**: `HealthFilterBar.test.tsx` (6) + `HealthPage.test.tsx` (9) + `HealthCaseDetailPage.test.tsx` (9) + `StudentReportHealthCasePage.test.tsx` (5) + 2 assertions in `StudentProfilePage.test.tsx` = 31 tests.
- **Frontend (closure pass)**: +8 assertions in `HealthCaseDetailPage.test.tsx` (guardian rendering, honest "no guardian" vs. "unavailable" distinction, data-minimization check, history rendering + cross-case navigation, honest "no other records" vs. "unavailable" distinction) = **39 frontend tests total**.
- **Full regression** (sequential, `fileParallelism: false`, matching the Prompt 10 fix): **1564 passed, 6 skipped, 0 failed** across 192 test files, up from 1551 at the original Prompt 11 milestone (+13 = 5 backend + 8 frontend, consistent with the counts above) and 1468 at the Prompt 10 milestone.
- **Live browser walkthrough (original Prompt 11)**: Health Operations Center queue (10 real persisted cases, real statistics) → search/filter → open a case → add an operational note → Start Monitoring → Mark Awaiting Update → Resume Monitoring → Mark Resolved → Close Case, all through the real rendered UI with real timestamps/actor names; Student Profile's real "Report Health Case" quick action → create form → confirmation dialog → real success state → "Open Case".
- **Live browser walkthrough (closure pass)**: reported two real cases for the same seeded student (real password+TOTP+AAL2 as `reception1@example.test`), opened one, and confirmed the real "Parent / Guardian" card showing both linked guardians' real name/relationship/phone; confirmed the real "Medical History" card showing exactly the OTHER case (the one being viewed correctly excluded); clicked through to that other case and confirmed the history link worked bidirectionally.
- **Live security verification (original Prompt 11)**: `prompt11_security_verify.py` — all adversarial checks passed (§8).
- **Live security verification (closure pass)**: `prompt11_closure_verify.py` — reception2 (Utkal) `studentId`-filtered query for the Kalinga student → zero results; reception2 opening a specific Kalinga case by id → 404 (anti-enumeration unchanged); a direct PostgREST read of `parent_student_relationships` by reception2 for the Kalinga student → zero rows (confirms no new direct-table grant).
- **Live realtime verification (original Prompt 11)**: `_health_realtime_probe.mjs` (deleted after use) — both tables' events delivered correctly to the in-scope subscriber and correctly withheld from the cross-hostel subscriber (§12). Not re-run for the closure pass — no realtime-affecting change was made (the `studentId` filter is a plain REST query parameter, not a realtime subscription).

## 16. Prompt 11 Closure — Condition Resolutions

A prior review of this module accepted it as **READY WITH CONDITIONS**, naming three items to close: Notification Center integration boundary, Parent/Guardian information availability, and read-only medical history availability. Each was independently re-investigated (repository/database reconnaissance performed fresh for this pass, not assumed from the original Prompt 11 report) and closed as follows.

### 17.1 Notification Center — VERIFIED DEFERRED

```
Dependency:            Staff-facing Health Operations Center notifications
                        (e.g. "critical health case created")
Current Source:        `notifications` table (packages/db/src/schema/notification.ts)
                        + `NotificationContext`/`NotificationService`
                        (apps/reception-dashboard/src/{contexts,services/notifications})
Availability:           SOURCE EXISTS — NOT AUTHORIZED FOR STAFF / NO PRODUCER CAPABILITY
Authorization:          notifications' `recipientType` enum (notification_recipient_type)
                        is exactly `{parent, student}` — no `staff` value exists at all.
                        RLS: `notifications_select_own_parent` / `_own_student` /
                        `_super_admin` only — no reception_warden/hostel_admin SELECT
                        policy, no INSERT/UPDATE policy for ANY client role (service-role
                        only, per that file's own comment: "Fastify service-role
                        (bypasses RLS) is the sole writer").
Evidence:               (1) packages/db/src/schema/notification.ts inspected directly —
                        enum and RLS confirmed as above. (2) NotificationService.ts's own
                        doc comment: "No real notification producer exists anywhere in
                        this repository today" — `list()` unconditionally returns `[]`.
                        (3) NotificationContext.tsx inspected directly — its full public
                        API is {notifications, unreadCount, isLoading, error, refresh,
                        markAsRead, acknowledge, dismiss, archive, markAllAsRead} — no
                        method exists to add/inject a notification, client-side or
                        server-side. (4) The only real writer of `notifications` rows in
                        this repository is apps/api/src/workers/notificationWorker.ts,
                        a pg-boss worker entirely specific to the leave-escalation
                        pipeline (ADR-017/018) — it exposes no generic
                        "create a notification for domain X" function any other module
                        (Health, Emergency, or otherwise) could call. (5) The Emergency
                        Operations Center (Prompt 10) independently reached and recorded
                        the identical conclusion for its own domain.
Current UI Behavior:    The Health Operations Center's queue/statistics/realtime
                        subscriptions already provide live operational awareness (§4/§12)
                        — this IS the implemented "operational alert" mechanism. No badge,
                        counter, or entry for health cases exists inside the Notification
                        Center UI, and none is claimed.
Current Backend Behavior: No INSERT into `notifications` is performed anywhere in
                        domain/health/*. No RLS policy was added, widened, or bypassed to
                        enable one. No parallel/second notification table or service was
                        created.
Future Integration Boundary:
  A future "Health Notification Producer" would need, at minimum:
  - A `staff` value added to `notification_recipient_type` (additive migration) — the
    single reason today's schema cannot represent "notify reception about a health case"
    at all, regardless of who writes the row.
  - A staff-facing SELECT RLS policy on `notifications`, hostel-scoped identically to
    every other staff table in this schema (`is_reception_for_student`/
    `is_hostel_admin_for_student` pattern).
  - A narrow, explicitly-scoped producer function (mirroring notificationWorker.ts's own
    shape) invoked ONLY from `health_case_events`' own transition points (e.g. `create()`
    when severity is `critical`, or `discharge()`), never a generic "any module may
    insert a notification" capability.
  - Deduplication: reuse the existing `notifications_leave_stage_recipient_key`-style
    uniqueness discipline (one logical notification per case+event, not per delivery
    attempt) if/when a health-specific unique key is defined.
  - Realtime: `notifications` already joins `supabase_realtime`
    (0002_realtime_publication.sql) — a new staff recipient type would not require a new
    migration for this piece.
  - Ownership: the Health domain would own deciding WHICH events become notifications
    (severity/category judgment calls) — the Notification Center remains the consumer,
    never the producer, matching this repository's own established division of
    responsibility (docs/notification-center.md §5).
  This is a genuine platform capability gap, not a Health-Operations-Center-specific
  limitation — the identical gap blocks the EOC and every other current/future staff
  module. Closing it is a cross-cutting platform change, correctly out of this closure
  task's own scope (it would require a new enum value + RLS policy + a real producer,
  none of which exists to reuse today).
```

### 17.2 Parent / Guardian Information — IMPLEMENTED

```
Dependency:             Parent/guardian contact for the student a health case concerns
Current Source:         `GET /students/{rollNumber}` (apps/api/src/routes/students.ts,
                        DrizzleStudentRepository.getProfileByRollNumber()) — the SAME
                        already-certified Student Operations Center endpoint (Prompt 8)
                        StudentProfilePage.tsx already consumes via useStudentProfile().
                        Backing tables: `parents` + `parent_student_relationships`
                        (packages/db/src/schema/identity.ts).
Availability:           SOURCE EXISTS — AUTHORIZED (via the existing backend-mediated
                        path; see Authorization below for the precise mechanism)
Authorization:          Fastify's connection is service-role and bypasses RLS by design
                        (ADR-006/ADR-014) — authorization for this endpoint is enforced
                        in APPLICATION CODE (the same hostel-scope check
                        `DrizzleHealthRepository`'s own `scopeCheck()` uses), not by a
                        `parents`/`parent_student_relationships` RLS policy for
                        reception_warden. Confirmed by direct inspection: `parents`'s own
                        RLS has policies only for `parents_select_own` (the parent
                        themselves), `parents_all_hostel_admin` (no per-row hostel filter
                        — a pre-existing, out-of-scope-for-this-task characteristic, not
                        introduced or changed here), and `parents_all_super_admin` — there
                        is NO reception_warden policy on `parents` or
                        `parent_student_relationships` at all. A DIRECT PostgREST
                        attempt by reception_warden against either table therefore
                        returns zero rows (fails closed) — the only path to this data
                        for reception staff is the audited, hostel-scoped Fastify
                        endpoint, exactly as it already was for StudentProfilePage.
                        Since a caller who can see a given health case (via
                        `DrizzleHealthRepository.scopeCheck()`) is, by construction,
                        already authorized for that same student's profile (identical
                        staff.hostel_id == student.hostel_id rule), reusing this endpoint
                        introduces no new authorization surface.
Evidence:               packages/db/src/schema/identity.ts inspected directly (parents/
                        parentStudentRelationships table+policy definitions);
                        apps/api/src/domain/student/repository.ts inspected directly
                        (StudentGuardianView { fullName, relationshipType, phoneNumber } —
                        confirmed as the exact, already-minimized field set); this is the
                        identical data StudentProfilePage.tsx has rendered to reception
                        staff since Prompt 8, live-verified again in this pass (§Browser
                        Validation below).
Current UI Behavior:    HealthCaseDetailPage.tsx's "Parent / Guardian" card calls
                        useStudentProfile(healthCase.studentRollNumber) directly — loading
                        skeleton while fetching; "Parent/guardian information is not
                        currently available." if the profile lookup itself errors (a
                        genuine unavailable-source state, never conflated with "no
                        guardian"); "No linked parent/guardian on record." only when the
                        query succeeds and genuinely returns zero guardians (a real,
                        successful zero-result, matching StudentProfilePage's own
                        identical, already-certified empty-state text); otherwise the
                        real fullName/relationshipType/phoneNumber for each linked
                        guardian — the exact same three fields StudentProfilePage already
                        shows, no more.
Current Backend Behavior: No backend change was required or made — `GET /students/
                        {rollNumber}` is reused completely unmodified, with its own
                        pre-existing, already-tested (Prompt 8: 38 tests) hostel-scope/
                        anti-enumeration coverage. No parent/guardian data was duplicated
                        into the health_cases domain's own repository/API contract.
Future Integration Boundary: N/A — implemented via reuse, not deferred.
```

### 17.3 Medical History — IMPLEMENTED

```
Dependency:             Read-only historical medical case record for a student
Current Source:         `health_cases` itself (this domain's own authoritative table,
                        Phase 4 Prompt 11) — a student's own past cases, queried via the
                        SAME `GET /health-cases` endpoint the operational queue already
                        uses, additively filtered by a new `studentId` query parameter.
Availability:           SOURCE EXISTS — AUTHORIZED (this domain's own table; no separate
                        history store was found or needed)
Authorization:          Identical to every other Health Operations Center query:
                        AAL2 → role (reception_warden/hostel_admin/super_admin) →
                        `scopeCheck()` (hostel scope) → RLS. The `studentId` filter is
                        applied ADDITIVELY, after scopeCheck() — never in place of it — so
                        a studentId outside the caller's hostel simply yields zero rows,
                        live-verified (§ below) and covered by a real-Postgres
                        integration test (reception2/Utkal querying the Kalinga student's
                        id → 0 results).
Evidence:               Reconnaissance performed for this closure pass searched the full
                        schema (packages/db/src/schema/*.ts) for medical_history,
                        health_history, previous_case(s), hospital_visit(s),
                        discharge_record(s), medical_record(s), admission_record(s) and
                        found NO matches — grep of packages/db/src/schema confirmed the
                        only "medical"/"health" terminology anywhere in the schema is
                        security_incident_type's `medical` value (Prompt 10, a different
                        domain) and this module's own health_case_* enums (Prompt 11).
                        No medical-history-specific service, route, or generated-client
                        type exists anywhere in apps/api or apps/reception-dashboard
                        outside of domain/health/* itself. `health_cases` (this module's
                        own table, already hostel-scoped, already RLS-protected, already
                        indexed on student_id via `health_cases_student_id_idx`) is
                        therefore the only authoritative source that exists for "a
                        student's past medical cases" — not a fabricated one.
Current UI Behavior:    HealthCaseDetailPage.tsx's "Medical History" card calls
                        useHealthCaseHistory(healthCase.studentId) — loading skeleton
                        while fetching; "Medical history is not currently available." if
                        the query itself errors (a genuine unavailable-source state,
                        never conflated with "no records"); "No other historical medical
                        records for this student." only when the query succeeds and the
                        student genuinely has no OTHER cases (the case currently being
                        viewed is excluded client-side); otherwise a read-only list (no
                        edit/delete/transition control of any kind) of the student's other
                        cases — category, status badge, and reported date — each entry a
                        plain navigation link to that OTHER case's own (equally read-only-
                        by-default, permission-gated-for-actions) detail page.
Current Backend Behavior: `HealthCaseListInput` gained one new optional field,
                        `studentId` (apps/api/src/domain/health/types.ts); `GET
                        /health-cases` gained one new optional, UUID-validated query
                        parameter (routes/health-cases.ts, OpenAPI updated, Orval
                        regenerated). No new table, no new migration, no RLS change, no
                        new permission — the exact same authorization chain every other
                        Health Operations Center query already enforces.
Future Integration Boundary: A future authorized external source (hospital records
                        system, KIIMS) could supply ADDITIONAL historical entries under
                        the same read-only contract — see §13's own KIIMS boundary — but
                        none is implemented or claimed here; today's medical history is
                        exclusively this repository's own `health_cases` records.
```

## 17. Out of Scope (explicitly not implemented, per this task's own Rules 3/4/5)

- Clinical treatment/diagnosis/prescription/lab-result/medical-document functionality — this is an operational coordination tool, never an EHR.
- KIIMS integration, hospital webhooks, scheduled synchronization — no real producer exists; see §13.
- Parent SMS/push/call notification delivery — no certified infrastructure exists for this domain; see §14.
- A Student Application health-alert producer — `apps/student-mobile` remains Prompt 0.2's unmodified template; the real, honest mechanism this prompt provides instead is the staff-initiated "Report Health Case" capability (§6).
- A new authentication mechanism, RBAC model, Student Operations Center, Notification Center, or audit system — all certified systems were reused unchanged.
