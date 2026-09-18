-- F-QG02-01 remediation (QG-02 Leave Authorization Workflow Review &
-- End-to-End Integration Certification).
--
-- QG-02 live-reproduced, via direct PostgREST against a real running local
-- Supabase instance using a genuine password-authenticated
-- reception1@example.test session (no forged JWT, no bypassed
-- authentication):
--
--   1. INSERT into leave_exit_authorizations for a leave request whose
--      status was still 'pending' (never sent for parent approval)
--      succeeded (201) -- lxa_insert_staff's WITH CHECK verified caller
--      identity/hostel scope/identity_confirmed=true but never checked the
--      referenced leave request's own status; lxa_insert_super_admin had no
--      join to leave_requests at all.
--   2. PATCH leave_requests SET status = 'approved' for that same pending
--      request, using the same reception credential, succeeded (200) with
--      ZERO leave_approval_events/audit_logs row written --
--      leave_requests_all_reception/_all_hostel_admin's single `for: "all"`
--      policy applies the same hostel-scope-only USING/WITH CHECK to
--      SELECT, INSERT, UPDATE, and DELETE alike, so any status value could
--      be written directly, bypassing DrizzleLeaveRepository.decide()
--      entirely.
--
-- Together these meant the workflow's central invariant -- "a student may
-- only exit after genuine parent approval" -- was enforced ONLY by
-- apps/api's Fastify application layer, not by the database, for any caller
-- reaching Supabase directly. This migration restores the invariant at the
-- RLS boundary without introducing a new authorization model, new table,
-- new role, or new SECURITY DEFINER function -- see
-- packages/db/src/schema/leave.ts's updated doc comments on each changed
-- policy for the full per-policy rationale.
--
-- Repository-wide search (this remediation) confirmed no frontend
-- application anywhere writes to `leave_requests` directly via a Supabase
-- client -- every real write goes through apps/api's service-role
-- connection, which bypasses RLS entirely by design. Narrowing this table's
-- RLS UPDATE grant therefore changes no legitimate application behavior; it
-- only removes an authorization surface nothing legitimate ever used.

-- ============================================================================
-- leave_requests: split the single `for: "all"` reception/hostel_admin
-- policy into per-operation policies so UPDATE can be narrowed
-- independently of SELECT/INSERT/DELETE (all three preserve their prior,
-- unchanged hostel-scoped behavior).
-- ============================================================================
DROP POLICY "leave_requests_all_reception" ON "leave_requests" CASCADE;--> statement-breakpoint
DROP POLICY "leave_requests_all_hostel_admin" ON "leave_requests" CASCADE;--> statement-breakpoint

CREATE POLICY "leave_requests_select_reception" ON "leave_requests" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "staff" s join "students" st on st.hostel_id = s.hostel_id where s.auth_user_id = auth.uid() and s.role = 'reception_warden' and st.id = "leave_requests"."student_id"));--> statement-breakpoint
CREATE POLICY "leave_requests_insert_reception" ON "leave_requests" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (exists (select 1 from "staff" s join "students" st on st.hostel_id = s.hostel_id where s.auth_user_id = auth.uid() and s.role = 'reception_warden' and st.id = "leave_requests"."student_id"));--> statement-breakpoint
CREATE POLICY "leave_requests_delete_reception" ON "leave_requests" AS PERMISSIVE FOR DELETE TO "authenticated" USING (exists (select 1 from "staff" s join "students" st on st.hostel_id = s.hostel_id where s.auth_user_id = auth.uid() and s.role = 'reception_warden' and st.id = "leave_requests"."student_id"));--> statement-breakpoint
-- USING requires status = 'manual_verification' -- matching the
-- already-documented "intended business use" of this grant
-- (docs/rls-policy-matrix.md: resolving manual_verification ->
-- approved/rejected/expired, per ADR-019), not a new capability. This is
-- what actually blocks the reproduced exploit: a 'pending' (or any other
-- non-manual_verification) row is no longer visible to this UPDATE policy
-- at all, so it cannot be force-approved directly.
CREATE POLICY "leave_requests_update_reception" ON "leave_requests" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("leave_requests"."status" = 'manual_verification' and exists (select 1 from "staff" s join "students" st on st.hostel_id = s.hostel_id where s.auth_user_id = auth.uid() and s.role = 'reception_warden' and st.id = "leave_requests"."student_id")) WITH CHECK (exists (select 1 from "staff" s join "students" st on st.hostel_id = s.hostel_id where s.auth_user_id = auth.uid() and s.role = 'reception_warden' and st.id = "leave_requests"."student_id"));--> statement-breakpoint

CREATE POLICY "leave_requests_select_hostel_admin" ON "leave_requests" AS PERMISSIVE FOR SELECT TO "authenticated" USING (public.current_staff_role() = 'hostel_admin' and exists (select 1 from "students" st where st.id = "leave_requests"."student_id" and st.hostel_id = public.current_staff_hostel_id()));--> statement-breakpoint
CREATE POLICY "leave_requests_insert_hostel_admin" ON "leave_requests" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (public.current_staff_role() = 'hostel_admin' and exists (select 1 from "students" st where st.id = "leave_requests"."student_id" and st.hostel_id = public.current_staff_hostel_id()));--> statement-breakpoint
CREATE POLICY "leave_requests_delete_hostel_admin" ON "leave_requests" AS PERMISSIVE FOR DELETE TO "authenticated" USING (public.current_staff_role() = 'hostel_admin' and exists (select 1 from "students" st where st.id = "leave_requests"."student_id" and st.hostel_id = public.current_staff_hostel_id()));--> statement-breakpoint
CREATE POLICY "leave_requests_update_hostel_admin" ON "leave_requests" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (public.current_staff_role() = 'hostel_admin' and "leave_requests"."status" = 'manual_verification' and exists (select 1 from "students" st where st.id = "leave_requests"."student_id" and st.hostel_id = public.current_staff_hostel_id())) WITH CHECK (public.current_staff_role() = 'hostel_admin' and exists (select 1 from "students" st where st.id = "leave_requests"."student_id" and st.hostel_id = public.current_staff_hostel_id()));--> statement-breakpoint

-- ============================================================================
-- leave_exit_authorizations: add the missing workflow-state precondition
-- (status = 'approved') to both INSERT policies.
-- ============================================================================
DROP POLICY "lxa_insert_staff" ON "leave_exit_authorizations" CASCADE;--> statement-breakpoint
DROP POLICY "lxa_insert_super_admin" ON "leave_exit_authorizations" CASCADE;--> statement-breakpoint

CREATE POLICY "lxa_insert_staff" ON "leave_exit_authorizations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
	"leave_exit_authorizations"."identity_confirmed" = true
	and "leave_exit_authorizations"."authorized_by_staff_id" = public.current_staff_id()
	and exists (
		select 1 from "staff" s join "leave_requests" lr on true
		join "students" st on st.id = lr.student_id
		where s.auth_user_id = auth.uid() and lr.id = "leave_exit_authorizations"."leave_request_id" and st.hostel_id = s.hostel_id
			and lr.status = 'approved'
	)
);--> statement-breakpoint
CREATE POLICY "lxa_insert_super_admin" ON "leave_exit_authorizations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
	"leave_exit_authorizations"."identity_confirmed" = true
	and public.current_staff_role() = 'super_admin'
	and exists (select 1 from "leave_requests" lr where lr.id = "leave_exit_authorizations"."leave_request_id" and lr.status = 'approved')
);
