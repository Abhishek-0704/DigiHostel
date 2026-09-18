-- Targeted security remediation: `lae_select_staff` BLOCKER (independent
-- security verification, post-Phase 3 Prompt 7A).
--
-- Prior state (the vulnerability): `lae_select_staff`'s USING clause was
--   exists (select 1 from staff s where s.auth_user_id = auth.uid())
-- — row-independent (it never referenced the target `leave_approval_events`
-- row at all), so it granted EVERY authenticated staff member, in ANY role
-- and ANY hostel, unrestricted SELECT on EVERY row in this table. Live,
-- empirically confirmed via real authenticated PostgREST requests against a
-- disposable local instance (never production): a Hostel-B reception_warden
-- read a Hostel-A leave request's approval-event row directly; the same row
-- was also readable by a library_incharge account (no hostel assignment at
-- all, and no RLS grant on `leave_requests` anywhere in this schema) and by
-- a staff session holding only AAL1 (password-only, MFA not completed) —
-- AAL2 is never checked by any RLS policy in this schema, it is exclusively
-- an apps/api application-layer gate (`requireAal2()`), so RLS was the
-- entire remaining boundary for this table and it provided none. The
-- exposed columns include `actor_parent_id`/`actor_staff_id`, which this
-- codebase's own API layer deliberately never serializes to any client
-- (LeaveApprovalEventView's doc comment: "never reveals which specific
-- parent/guardian/staff member acted") — direct PostgREST access bypassed
-- that intentional privacy design entirely.
--
-- Remediation: split into the same three-way role structure
-- leave_requests_all_reception/_all_hostel_admin/_all_super_admin already
-- use on this table's own parent row (`leave_requests`), reusing the
-- existing `is_reception_for_student`/`is_hostel_admin_for_student`
-- SECURITY DEFINER helpers built for F-05A (same already-proven shape:
-- STABLE, SET search_path, parameterized only by a server-derived student
-- id, resolves identity/hostel only from auth.uid() internally — never a
-- client-supplied hostel/staff id) rather than writing a new function. The
-- join-through-leave_requests-to-reach-a-student's-hostel pattern already
-- exists on this exact table (`lae_insert_reception_manual_override`),
-- proven safe and non-recursive in production use (`leave_requests` has no
-- policy that references `leave_approval_events`, so no RLS cycle is
-- possible). `library_incharge` intentionally receives no policy here at
-- all, matching `leave_requests`'s own complete absence of a
-- library_incharge grant — this architecture has never granted that role
-- any access to leave-domain data, and none is introduced now.
--
-- No table structure, grant, or unrelated policy changed. Student
-- (`lae_select_own_student`) and parent (`lae_select_linked_parent`) access
-- are untouched.
DROP POLICY "lae_select_staff" ON "leave_approval_events" CASCADE;--> statement-breakpoint

CREATE POLICY "lae_select_reception" ON "leave_approval_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "leave_requests" lr where lr.id = "leave_approval_events"."leave_request_id" and public.is_reception_for_student(lr.student_id)));--> statement-breakpoint
CREATE POLICY "lae_select_hostel_admin" ON "leave_approval_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "leave_requests" lr where lr.id = "leave_approval_events"."leave_request_id" and public.is_hostel_admin_for_student(lr.student_id)));--> statement-breakpoint
CREATE POLICY "lae_select_super_admin" ON "leave_approval_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (public.current_staff_role() = 'super_admin');
