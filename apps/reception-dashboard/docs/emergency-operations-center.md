# Emergency Operations Center (Phase 4, Prompt 10)

## 1. Purpose & Reconnaissance

Replaces Prompt 0.2's "Blocked — `security_incidents` has RLS but zero API surface" placeholder (`EmergencyPage.tsx`/`EmergencyService.ts`/`src/features/emergency/README.md`). Reconnaissance before implementation confirmed:

- `security_incidents` (`packages/db/src/schema/audit.ts`, `0000_cute_korvac.sql`) is the SDD's own single canonical incident table for this whole domain — `docs/database.md`'s entity list and `docs/reception-dashboard-architecture.md` §72 both name it as the intended backing store for BOTH "Emergency Management" (this prompt) and the future "Health Alerts" module.
- Its existing schema (`incident_type ∈ {missed_checkpoint, manual_flag}`, `status ∈ {open, escalated, resolved}`) belonged entirely to the separate, still-unbuilt Digital Library Pass checkpoint-monitoring domain (SDD Ch.6) — not general emergency categories.
- Zero Fastify route surface existed over this table at all before this prompt (confirmed by repository-wide search).
- No `apps/student-mobile` emergency-trigger implementation exists anywhere (that app is still Prompt 0.2's unmodified template scaffold) — the SDD's "Student Application → Emergency Trigger → Incident" pipeline is **not implemented**, and this prompt does not fabricate it.

**Decision**: extend `security_incidents` additively (new enum values, new nullable columns) rather than create a second, competing `emergency_incidents` table. This preserves the SDD's single-table model and keeps the existing checkpoint-monitoring domain (and its pgTAP coverage, `13_f05...sql`/`14_f05a...sql`) completely unaffected.

## 2. Data Model

```
security_incidents (extended, migrations 0016/0017)
  id, student_id, incident_type, status, geolocation*, resolved_at, created_at   [ORIGINAL]
  severity, description, assigned_staff_id, closed_at                            [NEW, all nullable]

security_incident_events (NEW — operational timeline, mirrors leave_approval_events)
  id, incident_id, event_type, actor_staff_id, note, occurred_at
```

- `incident_type`: 8 new values added (`medical`, `personal_safety`, `fire`, `security_threat`, `violence`, `infrastructure`, `harassment`, `other`) alongside the original `missed_checkpoint`/`manual_flag`.
- `status`: 3 new values added (`acknowledged`, `in_progress`, `closed`) alongside the original `open`/`escalated`/`resolved`. `escalated` is deliberately **not** part of the EOC's own transition matrix — it belongs to the checkpoint domain, and no concrete requirement justified wiring a new "Escalate" action to it.
- `severity`: new enum (`critical`/`high`/`medium`/`low`/`informational`), declared in that exact order so `ORDER BY severity ASC` naturally means "most severe first" — no fabricated CASE expression needed.
- All 4 new `security_incidents` columns are **nullable** — the original two incident types never populate them; required-at-creation for the new categories is enforced by the application layer (Zod), not a DB constraint that would invalidate existing rows.
- `security_incident_events` mirrors `leave_approval_events`'s established shape exactly: immutable (no UPDATE/DELETE policy for any role), RLS-scoped through the parent incident's student/hostel relationship. This is **not** a second audit system — `audit_logs` (service-role-only) still records every mutation; this table is what the EOC's own UI timeline queries/subscribes to.

## 3. Incident Lifecycle

```
open → acknowledged → in_progress → resolved → closed
```

Server-authoritative transition matrix (`EMERGENCY_TRANSITIONS`, `apps/api/src/domain/emergency/types.ts`):

| Action | From | To | Event written |
|---|---|---|---|
| `acknowledge` | `open` | `acknowledged` | `acknowledged` (also self-assigns the caller) |
| `startResponse` | `acknowledged` | `in_progress` | `response_started` |
| `resolve` | `in_progress` | `resolved` | `resolved` |
| `close` | `resolved` | `closed` | `closed` |

Enforced via a conditional `UPDATE ... WHERE status = <from>` (the same deterministic, concurrency-safe pattern `DrizzleLeaveRepository.decide()`/`markExpired()` already established) — an out-of-order or duplicate transition affects zero rows and returns 409, never silently succeeds or produces a duplicate event. Notes (`note_added`) may be added at any status except `closed`.

## 4. Emergency Creation — No Fabricated Student App Trigger

The intended Student Application "Emergency Trigger" producer does not exist. Rather than fabricate it, this prompt implements the real, honest mechanism the schema's own original design already established: **a staff-initiated incident report** (`POST /emergencies`, reusing the same staff-attestation concept `manual_flag` already modeled). Reached from the Student Operations Center's own profile page (`StudentProfilePage.tsx`'s "Report Emergency" quick action → `StudentReportEmergencyPage.tsx`), which reuses `useStudentProfile` for identification — no second search/lookup path. This is a genuine, immediately useful reception-desk capability (a call comes in, a warden logs it), not a placeholder substitute for the unbuilt producer.

## 5. API Surface

All under `/api/v1`, staff-only (`reception_warden`/`hostel_admin`/`super_admin`), AAL2-required, hostel-scoped (reception/hostel_admin to their own hostel, super_admin unscoped) — the same guard chain every other certified staff route uses:

- `GET /emergencies` — server-side paginated/filtered/sorted queue.
- `GET /emergencies/statistics` — server-derived active-incident counts.
- `GET /emergencies/{incidentId}` — detail + timeline.
- `POST /emergencies` — staff-initiated report.
- `POST /emergencies/{incidentId}/acknowledge` / `/start-response` / `/resolve` / `/close` — transitions.
- `POST /emergencies/{incidentId}/notes` — operational note.

## 6. Security

- Reuses the already-declared `emergency:manage` permission (`apps/reception-dashboard/src/lib/authorization/permissions.ts`, granted since Prompt 3, never previously wired) — no new permission was needed.
- `library_incharge` is never in the allowed-role list for any route — no product reason to manage a medical/fire/violence incident.
- **F-QG02-01 lesson applied from the start**: RLS `WITH CHECK` on `security_incidents_all_reception`/`_all_hostel_admin` independently requires a non-null `assigned_staff_id` to equal the caller's own resolved staff id — a direct PostgREST bypass cannot assign an incident to a different staff member (mirrors `movements_insert_staff`'s `recordedByStaffId` defense).
- `security_incidents_all_library` was narrowed to the original two incident types only — its pre-existing GLOBAL access is unaffected for `missed_checkpoint`/`manual_flag`, but does not silently extend to the 8 new emergency categories.
- `security_incident_events` INSERT pins `actor_staff_id` to the caller's own resolved staff id (forged-actor defense) and is hostel-scoped through the parent incident.
- See `docs/rls-policy-matrix.md`'s updated `security_incidents`/`security_incident_events` sections for the full per-role matrix.

## 7. Student Operations Integration

The EOC never duplicates student/guardian data. `EmergencyListItem`/`EmergencyDetail` carry only minimal display fields (name/roll number/hostel/room) — the detail page's "Open Student Profile" button navigates to the existing, already-certified Student Operations Center for guardian contact, leave context, and everything else.

## 8. Notification Center Integration

Not wired — confirmed via the same reasoning `NotificationService.ts`'s own doc comment already established for this exact table: the Notification Center's intended future data source for staff-facing panels is direct RLS-scoped queries over operational tables (`leave_requests`/`leave_approval_events`/`security_incidents`), not the `notifications` table (which has zero staff RLS grant and an enum that doesn't model a staff recipient). The EOC's own queue/statistics/realtime already provide the "live incident awareness" the Notification Center would otherwise need to surface — wiring a second, duplicate producer into `NotificationContext` was judged unnecessary scope for this prompt.

## 9. Realtime

`security_incidents` and `security_incident_events` both join the `supabase_realtime` publication directly (migration `0017`), the same established pattern F-08/F-QG02-04/Prompt-9 already used. Two dedicated hooks:

- `useEmergencyQueueRealtime` — unfiltered subscription on `security_incidents`, mirrors `useLeaveQueueRealtime` (the queue must learn about every incident its own RLS-scoped subscription is allowed to see).
- `useEmergencyDetailRealtime` — filtered to one incident (`id=eq.<id>` / `incident_id=eq.<id>`) across both tables, mirrors `useLeaveApprovalEventsRealtime`.

Both always invalidate-and-refetch the authoritative REST query — never a client-side merge of the raw realtime payload.

## 10. Data Minimization

`EmergencyListItem`/`EmergencyDetail` never include the raw `assigned_staff_id` alongside a resolved `assignedStaffName` without reason — both are included deliberately: this is a staff-only operational surface (never reachable by a student/parent session), so showing which colleague is handling an incident carries none of the actor-disclosure concern `LeaveApprovalEventView` guards against elsewhere. Guardian/parent contact is never duplicated into this domain's own views.

## 11. Testing Summary

- **Backend**: 24 route tests (`routes/emergencies.test.ts`, full security matrix A–N adapted to this domain) + 10 service unit tests (`domain/emergency/service.test.ts`) + 8 real-Postgres integration tests (`domain/emergency/repository.integration.test.ts`, including a genuine concurrency race) = 42 new tests.
- **Database**: 28 new pgTAP assertions (`20_emergency_operations_center_rls.sql`) + 2 new realtime-publication assertions (`11_realtime_publication.sql`) = 30 new.
- **Frontend**: `EmergencyFilterBar.test.tsx` (6), `EmergencyPage.test.tsx` (9), `EmergencyDetailPage.test.tsx` (8), `StudentReportEmergencyPage.test.tsx` (5), plus 2 new assertions in `StudentProfilePage.test.tsx` = 30 new.

## 12. Future Integration Boundaries (explicitly not implemented)

- **Student Application Emergency Trigger**: not implemented anywhere in this repository. `POST /emergencies` (staff-initiated) is the real, honest mechanism this prompt provides instead — not a substitute claiming to be the same thing.
- **Parent contact / escalation**: no automated parent notification, SMS, or call is triggered by any EOC action. No external escalation (ambulance dispatch, KIIMS, police/fire APIs, GPS tracking) is implemented — explicitly out of scope per this prompt's own instruction.
- **Health Alert Management**: the next roadmap module. `security_incidents`/`security_incident_events`' additive design (new enum values, new nullable columns, same RLS pattern) is the reusable foundation for it — see the Final Report's readiness section for what specifically transfers.
