-- Phase 3, Prompt 7C — Student Verification & Exit Authorization.
--
-- New table `leave_exit_authorizations`: the authoritative record of "this
-- student physically left the hostel for this leave request." Reconnaissance
-- confirmed no existing table represents this fact: `journey_events`/
-- `qr_sessions`/`library_passes` (packages/db/src/schema/library.ts) belong
-- to the separate, still-unbuilt Digital Library Pass module (SDD Ch.6) —
-- `journey_events.library_pass_id` is NOT NULL and its INSERT policy hard-
-- requires `biometric_confirmed = true`, so reusing it would mean either
-- fabricating a library pass that was never issued or fabricating a
-- biometric confirmation that never happened, both explicitly forbidden.
--
-- Deliberately NOT a new `leave_request_status` enum value: that state
-- machine remains exactly the Parent Approval domain's own vocabulary
-- (ADR-015/016/017/018/019/025), unexpanded by this table.
--
-- Handwritten (matches this repository's established convention for
-- policy-bearing migrations, e.g. 0009/0010 — `drizzle-kit generate`
-- requires interactive policy-conflict resolution unavailable in this
-- non-TTY environment), reviewed for exact correspondence with
-- packages/db/src/schema/leave.ts's `leaveExitAuthorizations` table
-- definition before being applied.
CREATE TABLE "leave_exit_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"leave_request_id" uuid NOT NULL,
	"authorized_by_staff_id" uuid NOT NULL,
	"identity_confirmed" boolean NOT NULL,
	"authorized_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_exit_authorizations_leave_request_id_unique" UNIQUE("leave_request_id")
);--> statement-breakpoint
ALTER TABLE "leave_exit_authorizations" ADD CONSTRAINT "leave_exit_authorizations_leave_request_id_leave_requests_id_fk" FOREIGN KEY ("leave_request_id") REFERENCES "public"."leave_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_exit_authorizations" ADD CONSTRAINT "leave_exit_authorizations_authorized_by_staff_id_staff_id_fk" FOREIGN KEY ("authorized_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lxa_authorized_at_idx" ON "leave_exit_authorizations" USING btree ("authorized_at");--> statement-breakpoint
ALTER TABLE "leave_exit_authorizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "lxa_select_own_student" ON "leave_exit_authorizations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "leave_requests" lr where lr.id = "leave_exit_authorizations"."leave_request_id" and lr.student_id = public.current_student_id()));--> statement-breakpoint
CREATE POLICY "lxa_select_linked_parent" ON "leave_exit_authorizations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "leave_requests" lr join "parent_student_relationships" psr on psr.student_id = lr.student_id where lr.id = "leave_exit_authorizations"."leave_request_id" and psr.parent_id = public.current_parent_id()));--> statement-breakpoint
CREATE POLICY "lxa_select_reception" ON "leave_exit_authorizations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "leave_requests" lr where lr.id = "leave_exit_authorizations"."leave_request_id" and public.is_reception_for_student(lr.student_id)));--> statement-breakpoint
CREATE POLICY "lxa_select_hostel_admin" ON "leave_exit_authorizations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "leave_requests" lr where lr.id = "leave_exit_authorizations"."leave_request_id" and public.is_hostel_admin_for_student(lr.student_id)));--> statement-breakpoint
CREATE POLICY "lxa_select_super_admin" ON "leave_exit_authorizations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (public.current_staff_role() = 'super_admin');--> statement-breakpoint
CREATE POLICY "lxa_insert_staff" ON "leave_exit_authorizations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
	"leave_exit_authorizations"."identity_confirmed" = true
	and "leave_exit_authorizations"."authorized_by_staff_id" = public.current_staff_id()
	and exists (
		select 1 from "staff" s join "leave_requests" lr on true
		join "students" st on st.id = lr.student_id
		where s.auth_user_id = auth.uid() and lr.id = "leave_exit_authorizations"."leave_request_id" and st.hostel_id = s.hostel_id
	)
);--> statement-breakpoint
CREATE POLICY "lxa_insert_super_admin" ON "leave_exit_authorizations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("leave_exit_authorizations"."identity_confirmed" = true and public.current_staff_role() = 'super_admin');
