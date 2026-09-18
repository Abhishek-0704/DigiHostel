# Student Movement Management System — Movement Engine & Hostel Return (Phase 4, Prompt 9)

## 1. Purpose & Concepts

The Movement Engine is a minimal, extensible foundation for recording that a student's physical movement (exit, return, and — in future — library/medical/emergency/transfer/visitor movements) has been completed. **Hostel Return is the only implemented movement type in this prompt.** Every other conceptual type named in the product principle (Library Exit/Return, Medical Exit, Emergency, Temporary Exit, Hostel Transfer, Visitor Entry) is deliberately unimplemented — no business logic, no UI, and no enum value exists for any of them, per this task's own "do not implement future types" instruction.

## 2. Reconnaissance Findings

No existing table represented "a student's physical movement completed." `journey_events`/`qr_sessions` (Digital Library Pass domain) were re-examined and re-rejected for the same reasons Prompt 7C already established for `leave_exit_authorizations`: `library_pass_id`/`qr_session_id` are NOT NULL and `biometric_confirmed` is hard-required — reusing them would mean fabricating a library pass and biometric confirmation that never happened. `checkpoint_type`'s existing `hostel_return` enum value belongs entirely to that library-pass checkpoint vocabulary, not to this table — a new, separate `movement_type` enum was used instead.

**Exit Authorized vs. Student Actually Exited**: this system's only authoritative record of departure is `leave_exit_authorizations` — a staff attestation (Prompt 7C), not a verified physical-egress scan. Hostel Return's eligibility check treats this attestation as the system's one and only fact about departure, consistent with the discipline already established there; it is never silently assumed from `leave_requests.status = 'approved'` alone.

## 3. Data Model

```
movements
  id, student_id, movement_type ('hostel_return' only),
  leave_request_id (NOT NULL — every implemented type today is leave-tied),
  recorded_by_staff_id, occurred_at, metadata (jsonb, extension point)
  UNIQUE(leave_request_id, movement_type)
```

One row means "this movement, of this type, tied to this leave request, was recorded" — the same single-atomic-attestation shape `leave_exit_authorizations` already uses (Register Return, like Authorize Exit, is one atomic staff action, not a multi-step process with real intermediate states). **No `students.status`/presence column was added** — "is this student currently inside or outside the hostel" is derived entirely from `(exitAuthorized && !returnRecorded)`, never a separately stored, potentially contradictory field. **No occupancy table/counter was built** — hostel occupancy is derived via a `COUNT` over the same data (see §12, added by the remediation pass below), not a maintained counter.

## 4. Extension Model — Adding a Future Movement Type

1. Add a new `movement_type` enum value (a new migration).
2. Add domain logic (a new repository method or a parameterized one, a new route or an extended one) — `movements`' own schema needs no redesign; `leave_request_id` may need to become nullable if the new type is genuinely not leave-tied.
3. Add the new type's own eligibility rules — do not weaken Hostel Return's.
4. Add a new RLS INSERT policy (or extend the existing one) with that type's own workflow-state invariant, mirroring the exact pattern `movements_insert_staff`/`movements_insert_super_admin` establish here.

## 5. Hostel Return Workflow

```
Student Operations Center (Prompt 8, reused)
        ↓
Student Profile (currentLeave.exitAuthorized && !returnRecorded)
        ↓
"Register Return" quick action
        ↓
Return Workspace (/students/:rollNumber/return?leaveRequestId=<id>)
        ↓
Verification checklist (all real, already-fetched fields)
        ↓
Explicit confirmation dialog
        ↓
POST /leave-requests/{id}/return
        ↓
Server-authoritative transaction (eligibility re-checked, INSERT, event, audit)
        ↓
Success banner + query invalidation
```

## 6. Eligibility (server-authoritative)

`POST /leave-requests/{leaveRequestId}/return` requires, checked server-side inside one transaction: the leave request exists and is in the caller's hostel scope; `status = 'approved'`; a real `leave_exit_authorizations` row exists for it; no `movements` row already exists for it (`UNIQUE(leave_request_id, movement_type)`). The UI's own checklist is informative only — every field it shows is a real, already-fetched value from `GET /students/{rollNumber}`, never independently computed or trusted as authorization.

## 7. Concurrency

Database-enforced via `UNIQUE(leave_request_id, movement_type)` — mirrors `leave_exit_authorizations`'s proven pattern exactly, including the same try/catch-around-the-whole-transaction discipline learned live during Prompt 7C (catching a unique-violation inside the transaction callback leaves Postgres in an aborted protocol state). Live-verified: a genuine two-thread concurrent race against real Postgres produces exactly one success and one 409 conflict (`repository.integration.test.ts`), and the same result via two simultaneous real HTTP requests through Fastify (`movements.test.ts`).

## 8. Integrations

- **Leave Authorization**: reused unmutated. `leave_requests.status` is never changed by a return; parent approval is never reopened.
- **Student Operations**: `GET /students/{rollNumber}`'s `currentLeave` gained `returnRecorded`/`returnedAt` — the only change to that endpoint's contract. No second student-search system was built.
- **Parent Application**: not touched. No return-notification path exists in the Parent App today; none was fabricated. A future `StudentReturnService → ParentIntegrationService` boundary is a natural extension point but was not built speculatively.
- **SAP**: re-confirmed BLOCKED / NOT IMPLEMENTED. Return eligibility never depends on it.
- **Realtime**: `movements` joins `supabase_realtime` directly (migration `0015`), mirroring F-08/F-QG02-04's precedent. The actively tested live-sync path the UI relies on remains the existing `leave_approval_events` subscription already wired on the profile/return pages (a return also writes a `manual_override` event). The `movements` table's OWN direct channel was independently, live-verified by the remediation pass (§12): a second, genuinely authenticated client subscribed directly to `postgres_changes` on `movements` received the real INSERT row the instant a staff session recorded a return, with the payload's `id`/`leave_request_id`/`student_id`/`occurred_at` matching the persisted row exactly, and a cross-hostel subscriber (Utkal) received nothing for a Kalinga student's movement — RLS-scoped per subscriber, exactly like every other realtime-enabled table in this schema.

## 9. Security

Identical AAL2/role/hostel-scope chain to every certified staff route, reusing the already-declared `movement:return` permission. **The F-QG02-01 lesson was applied from the start, not retrofitted**: the workflow-state invariant (approved + exit-authorized) is enforced in the RLS `WITH CHECK` itself (`movements_insert_staff`/`movements_insert_super_admin`), not left to Fastify alone — a direct PostgREST INSERT bypassing the API cannot fabricate a return for a leave that was never actually exited. 24 new pgTAP assertions cover this exactly (own-hostel allow, cross-hostel deny, pending/rejected/not-exited deny for both staff and super_admin, forged-actor deny, duplicate deny, immutability).

## 10. Testing Summary

Backend: 8 service unit + 17 route adversarial (full §29 A–N matrix) + 5 live-Postgres integration (including a genuine two-thread concurrency race) = 30 new tests. Database: 24 new pgTAP assertions (`19_movements_rls.sql`) + 1 publication-membership assertion. Frontend: 10 new (`StudentReturnPage.test.tsx`) + 3 new/updated (`StudentProfilePage.test.tsx`). Remediation pass (§12) added 10 more: 6 new real-Postgres integration tests (`domain/student/repository.integration.test.ts`) + 1 service unit test + 2 new frontend presence-badge tests + 1 route data-minimization allow-list update.

## 11. Components

`StudentReturnPage` (workspace), reusing `Card`/`StatusBadge`/`ConfirmationDialog`/`Can`/`Button`/`EmptyState` — no new shared primitive was created. `useRecordHostelReturn` (mutation hook, mirrors `useAuthorizeExit` exactly). `MovementService` (thin transport wrapper).

## 12. Remediation Pass — Hostel Presence, Occupancy, and Independent Realtime Verification

This section closes the three conditions an independent review of this prompt's original implementation left open. No RLS policy, migration, or business-logic change was made — this is a derived-read addition plus a live-verification pass.

**Student hostel presence (Condition 1).** `GET /students/{rollNumber}` now returns a top-level `hostelPresence: "inside_hostel" | "outside_hostel"` field on `StudentProfile` (`packages/api-spec/openapi.yaml`'s `HostelPresence` schema), computed server-side in `DrizzleStudentRepository.getProfileByRollNumber()` (`apps/api/src/domain/student/repository.ts`) using the exact rule already documented on `StudentCurrentLeaveView.returnRecorded` since this prompt's original implementation: `outside_hostel` iff the student's own current leave is exit-authorized and has no return recorded; `inside_hostel` otherwise, including "no leave request at all." It is never a client-supplied value, never a second stored column, and both `StudentProfilePage` and `StudentReturnPage` render the identical server value (a `StatusBadge`, never color-only) so the two pages can never disagree about a student's presence.

**Hostel occupancy (Condition 2).** `DrizzleStudentRepository.getHostelPresenceSummary(scope)` (same file) computes `{ totalStudents, studentsInside, studentsOutside }` for a staff caller's own hostel scope (or unscoped for `super_admin`), via one query using `distinct on (student_id)` to resolve each in-scope student's own most recent leave request, then counting how many are exit-authorized-and-not-yet-returned. This is deliberately **not** exposed by any route or rendered by any page — no dashboard in this repository currently consumes an occupancy figure, so per this remediation's own explicit "do not manufacture a dashboard to satisfy the requirement" instruction, only the reusable, tested derivation exists; wiring it to a UI is deferred to whichever future prompt genuinely needs it. Covered by 4 real-Postgres integration tests (own-hostel counting, cross-hostel isolation, super_admin's unscoped total, and a structural test that the summary shape carries no client-influenceable field).

**Independent `movements` realtime verification (Condition 3).** Two genuinely authenticated `@supabase/supabase-js` clients (never forged tokens) were used directly against the local Supabase instance: Client A performed a real Hostel Return through the actual running API; Client B, signed in as `reception1@example.test`, was independently subscribed to `postgres_changes` on `movements` and received the live INSERT the instant Client A's call committed, with the payload's `id`/`leave_request_id`/`student_id`/`occurred_at`/`movement_type` matching the persisted row exactly. A second run repeated this with Client B signed in as `reception2@example.test` (Utkal) — it received zero events for the Kalinga student's movement, live-confirming the existing `movements_select_reception` RLS policy (unchanged) also governs realtime delivery, not merely direct reads. The probe scripts were temporary (matching the F-QG02-04 precedent) and were deleted after capturing this evidence — they are not part of the repository.

**Live end-to-end confirmation.** Through the actual rendered Reception Dashboard UI (real password+TOTP+AAL2 session as `reception1@example.test`): the Student Profile and Return Workspace both showed a real "Outside Hostel" badge for an exit-authorized, not-yet-returned student; clicking Register Return → confirming the dialog → the badge flipped live to "Inside Hostel" on the same page (query invalidation, not a page reload) and remained consistent on a fresh navigation back to the Profile page. Independently: a service-role database read confirmed the `movements` row's genuine persistence; a repeat return through the same real staff session returned `409`; a cross-hostel staff session on the same leave request returned `404`; and a direct PostgREST INSERT bypass attempt from that cross-hostel session was blocked `403` by the unchanged RLS invariant.
