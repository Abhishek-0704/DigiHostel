# Student Operations Center (Phase 4, Prompt 8)

Replaces Prompt 0.2's `StudentsPage`/`StudentProfilePage` placeholders with a real, read-oriented workspace for locating a student and reviewing their current operational context. This document records the architecture, the honest data-availability boundary, and the evidence trail for this prompt.

## 1. Architecture Summary

```text
StudentsPage (search)              StudentProfilePage (profile)
        ↓                                    ↓
useStudentSearch (server state)     useStudentProfile (server state)
        ↓                                    ↓
studentOperationsService            studentOperationsService
        ↓                                    ↓
GET /api/v1/students                GET /api/v1/students/{rollNumber}
        ↓                                    ↓
StudentService (Fastify)            StudentService (Fastify)
        ↓                                    ↓
DrizzleStudentRepository            DrizzleStudentRepository
        ↓                                    ↓
Supabase/Postgres (service-role connection, RLS unaffected/untouched)
```

No new authentication mechanism, role, or permission was introduced — reuses the already-declared `student:search` permission (`lib/authorization/permissions.ts`, granted to `reception_warden`/`hostel_admin`/`super_admin` since Prompt 3, never previously wired to a real route) and the identical AAL2/hostel-scope preHandler chain every certified staff route in `routes/leave.ts` already uses.

## 2. Reconnaissance Findings (what actually exists)

The authoritative `students` table (`packages/db/src/schema/identity.ts`) carries only: `id`, `authUserId`, `rollNumber`, `fullName`, `hostelId`, `roomId`, timestamps. No department, program, semester, gender, phone, photograph, registration number, academic year, student category, or mentor field exists anywhere in this schema. `parents` carries only `fullName`/`phoneNumber` beyond its own id; per-relationship detail is limited to `parent_student_relationships.relationshipType`/`escalationOrder`. `rooms` carries only `roomNumber` — no `floor` column exists anywhere in this schema.

Because of this, the product prompt's own "potential fields" list (Department, Program, Academic Year, Phone, Photograph, Registration Number, Gender, Student Category, Floor) is **not implemented** — not because of an oversight, but because none of those fields are authoritative. Implementing them would have required fabricating data, which this task's No-Fabrication Rule explicitly forbids. Every section that would otherwise show one of these fields instead shows an honest "not available" note.

SAP: re-confirmed by repository-wide search (`grep -ril "\bsap\b"`) — no scraper, service, table, endpoint, or credential exists anywhere. **BLOCKED / NOT IMPLEMENTED**, unchanged from every prior certified finding (QG-01, QG-02). The profile's "Academic & Mentor" card states this honestly and never gates any workflow on it.

## 3. Search Strategy

`GET /api/v1/students` — case-insensitive **prefix** match on `full_name` OR `roll_number` (`q`), server-side paginated (`page`/`pageSize`, max 50/page), server-side sorted (`sortBy` ∈ {fullName, rollNumber}, `sortDir`), with the student's own `id` as a deterministic tie-breaker so pagination never duplicates or skips a row when two students share a sort key. The frontend debounces the raw input (`useDebouncedValue`, 300ms) before it ever reaches the query — not every keystroke triggers a request — and TanStack Query's own query-key-keyed cache supersedes a stale in-flight request when the debounced value changes, rather than a manual `AbortController`.

A new index, `students_full_name_lower_idx` (`btree (lower(full_name))`, migration `0014_student_operations_search_index.sql`), was added because the actual query shape (`lower(full_name) LIKE lower($1) || '%'`) cannot use a plain index on the raw column — Postgres can't use a btree on `full_name` for a query that wraps it in `lower()`. `roll_number` already had a unique index (migration `0000`) that supports its own prefix match with no change needed. No trigram/full-text index was added — no requirement asks for substring ("contains") search, and introducing `pg_trgm` speculatively would be exactly the "do not create speculative indexes" this task's own scope boundary forbids.

## 4. Profile Architecture

`GET /api/v1/students/{rollNumber}` returns identity, hostel/room, linked guardians (name/relationship/phone only), and the student's own most recent DigiHostel Hostel Leaving Request with its immutable `leave_approval_events` timeline — reused unmutated from the certified Parent Approval / Exit Authorization workflow (Prompt 7A/7B/7C, QG-02 PASSED WITH MINOR IMPROVEMENTS). The response is read-only in both directions: this page never issues a PATCH/PUT/DELETE against any student/parent/leave record.

A nonexistent roll number and a roll number that exists outside the caller's hostel scope are deliberately indistinguishable (404, identical error code) — the same anti-enumeration shape `GET /leave-requests/{leaveRequestId}` already established.

## 5. Operational Summary Design

There is no separate "operational summary" endpoint distinct from the profile — the profile response already carries the one real, authoritative operational fact this system can honestly report per student (its current leave request, if any, and whether an exit has been authorized for it). No fabricated counts ("2 pending leaves", "3 active alerts") are shown anywhere; a student with no leave request shows "This student has no leave request on record," not a zero-filled card pretending to summarize activity that doesn't exist.

## 6. Timeline Architecture

The "Activity Timeline" section renders the current leave request's own `leave_approval_events` rows verbatim (event type + response + timestamp, never actor identity — the same omission discipline `LeaveApprovalEventView` already applies everywhere else in this codebase). No new event table, no duplicated audit data, no universal cross-module event feed was created — this task's own explicit instruction ("do not create a new universal event table merely to make the UI easier"). Only leave-domain events exist in this system today; library/emergency/health/room-change/complaint events have no source table anywhere and are correctly absent from the timeline rather than represented as empty rows.

## 7. Quick Actions Architecture

Two real launch points exist, both permission-gated and both routing into already-certified destinations: "Open Leave Request" (`/leave/:id`, Prompt 7B) when the student has a leave request, and "Verify Student" (`/students/:rollNumber/verification`, Prompt 7C) when that leave request is `approved`. Six future launch points (Register Return, Library Pass, Emergency Response, Health Alert, Room Information, Complaint History) render as disabled buttons with a "Coming soon — future module" title — no fake route was created for any of them, per this task's explicit prohibition.

## 8. Data-Source Availability Table

| Section | Status | Source |
|---|---|---|
| Name, roll number | REAL | `students` |
| Hostel, room | REAL | `hostels`/`rooms` via `students.hostelId`/`roomId` |
| Guardian name/relationship/phone | REAL | `parents` + `parent_student_relationships` |
| Current leave status/reason/dates | REAL | `leave_requests` (most recent row) |
| Exit authorization | REAL | `leave_exit_authorizations` |
| Approval-event timeline | REAL | `leave_approval_events` |
| Department/Program/Semester/Photo/Registration No./Academic Year/Gender/Student Category | **UNAVAILABLE** — no such column exists | — |
| Floor | **UNAVAILABLE** — no such column exists | — |
| Mentor / SAP academic data | **BLOCKED / NOT IMPLEMENTED** | no SAP integration anywhere in this repository |
| Library / Health / Emergency status | **FUTURE** — module not yet built | — |

## 9. SAP Dependency Status

BLOCKED / NOT IMPLEMENTED — see §2. The Student Operations Center is architecturally SAP-ready (a future integration would populate the "Academic & Mentor" card's data source without any UI redesign) but no scraper, service, or credential exists today, and none was fabricated.

## 10. Security / Hostel-Scope Model

Identical to every certified staff route: `authenticate → requireStaffRole(reception_warden, hostel_admin, super_admin) → requireAal2()`, then hostel scope resolved server-side from the caller's own `staff` row (`DrizzleStudentRepository`'s `hostelScopedForStaff`, mirroring `DrizzleLeaveRepository`'s identical pattern) — never a client-supplied `hostelId`/`staffId`/`role`. Both query-parameter schemas are `.strict()` — an unrecognized field (e.g. an attempted `hostelId` override) is rejected with 400, not silently ignored. Verified live: reception staff from one hostel cannot see or resolve another hostel's students, either via search or direct roll-number lookup (route tests + real-Postgres integration tests, §13).

## 11. State Management

Two layers, matching every other Reception Dashboard feature: page-local UI state (search text, sort, page — plain `useState` in `StudentsPage`) and server state (`useStudentSearch`/`useStudentProfile`, thin TanStack Query wrappers). No new global store was introduced.

## 12. Component Hierarchy

```text
StudentsPage
  SearchInput (reused)
  StudentResultsTable
    Table, EmptyState, ErrorState, Skeleton, Button (all reused)

StudentProfilePage
  Card ×6 (Identity, Hostel, Parent/Guardian, Academic & Mentor, Current Leave, Activity Timeline, Quick Actions)
  LeaveStatusBadge, StatusBadge, Can, Button (all reused)
```

## 13. Testing Strategy

Backend: 12 service unit tests (hostel scope, prefix search, deterministic pagination, anti-enumeration) + 19 route adversarial tests (unauthenticated, wrong role, AAL1, hostel-scope isolation, validation, strict-schema rejection of a manipulated `hostelId` query param, data-minimization on the response shape) + 7 live-Postgres integration tests against real seed data. Frontend: 10 `StudentsPage` tests (rendering, empty/error/loading states, sort/search wiring, pagination) + 9 `StudentProfilePage` tests (partial-data rendering, honest absence states, permission-gated quick actions, disabled future actions, error state). No pgTAP/RLS test was added — this prompt introduced no RLS policy or grant change (only an index), matching the existing `students_select_own_hostel_reception`/`students_all_hostel_admin`/`students_all_super_admin` policies, which already correctly scope this data and were left untouched.
