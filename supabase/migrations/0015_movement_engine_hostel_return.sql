-- Phase 4, Prompt 9 — Student Movement Management System (Movement Engine),
-- first implementation: Hostel Return.
--
-- Reconnaissance confirmed no existing table represents "a student's
-- physical movement completed": journey_events/qr_sessions (Digital
-- Library Pass domain) have NOT NULL library_pass_id/qr_session_id and a
-- hard-required biometric_confirmed, so reusing them would mean
-- fabricating data this task explicitly forbids — the same rejection
-- leave_exit_authorizations (Prompt 7C) already established for hostel
-- exit. A new, minimal, genuinely reusable table was therefore required.
--
-- One row means "this movement, of this type, tied to this leave request,
-- was recorded" — the same single-atomic-attestation shape
-- leave_exit_authorizations already uses (Register Return, like Authorize
-- Exit, is one atomic staff action, not a multi-step process with real
-- intermediate states to persist). Only movement_type = 'hostel_return' is
-- implemented; every other conceptual future type (library, medical,
-- emergency, temporary exit, transfer, visitor) is deliberately absent
-- from the enum — an unimplemented enum value would be a speculative
-- extension point, not a real one.
--
-- F-QG02-01's lesson is applied FROM THE START here, not retrofitted: the
-- workflow-state invariant (a return may only be recorded for a leave
-- request that is genuinely 'approved' AND already has a real
-- leave_exit_authorizations row) is enforced in the RLS WITH CHECK itself,
-- not left to the Fastify application layer alone — a direct PostgREST
-- INSERT bypassing the API cannot fabricate a return for a leave that was
-- never actually exited.
--
-- Handwritten (matches this repository's established convention for
-- policy-bearing migrations — drizzle-kit generate requires interactive
-- policy-conflict resolution unavailable in this non-TTY environment),
-- reviewed for exact correspondence with packages/db/src/schema/
-- movement.ts / enums.ts's movementType addition.

CREATE TYPE "movement_type" AS ENUM ('hostel_return');--> statement-breakpoint

CREATE TABLE "movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"movement_type" "movement_type" NOT NULL,
	"leave_request_id" uuid NOT NULL,
	"recorded_by_staff_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "movements_leave_request_type_key" UNIQUE("leave_request_id","movement_type")
);--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_leave_request_id_leave_requests_id_fk" FOREIGN KEY ("leave_request_id") REFERENCES "public"."leave_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_recorded_by_staff_id_staff_id_fk" FOREIGN KEY ("recorded_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movements_student_id_idx" ON "movements" USING btree ("student_id");--> statement-breakpoint
ALTER TABLE "movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "movements_select_own_student" ON "movements" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("movements"."student_id" = public.current_student_id());--> statement-breakpoint
CREATE POLICY "movements_select_linked_parent" ON "movements" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "parent_student_relationships" psr where psr.student_id = "movements"."student_id" and psr.parent_id = public.current_parent_id()));--> statement-breakpoint
CREATE POLICY "movements_select_reception" ON "movements" AS PERMISSIVE FOR SELECT TO "authenticated" USING (public.is_reception_for_student("movements"."student_id"));--> statement-breakpoint
CREATE POLICY "movements_select_hostel_admin" ON "movements" AS PERMISSIVE FOR SELECT TO "authenticated" USING (public.is_hostel_admin_for_student("movements"."student_id"));--> statement-breakpoint
CREATE POLICY "movements_select_super_admin" ON "movements" AS PERMISSIVE FOR SELECT TO "authenticated" USING (public.current_staff_role() = 'super_admin');--> statement-breakpoint
CREATE POLICY "movements_insert_staff" ON "movements" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
	"movements"."recorded_by_staff_id" = public.current_staff_id()
	and exists (
		select 1 from "staff" s join "students" st on st.id = "movements"."student_id"
		where s.auth_user_id = auth.uid() and st.hostel_id = s.hostel_id
	)
	and exists (
		select 1 from "leave_requests" lr
		where lr.id = "movements"."leave_request_id"
			and lr.student_id = "movements"."student_id"
			and lr.status = 'approved'
	)
	and exists (
		select 1 from "leave_exit_authorizations" lxa
		where lxa.leave_request_id = "movements"."leave_request_id"
	)
);--> statement-breakpoint
CREATE POLICY "movements_insert_super_admin" ON "movements" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
	public.current_staff_role() = 'super_admin'
	and exists (
		select 1 from "leave_requests" lr
		where lr.id = "movements"."leave_request_id"
			and lr.student_id = "movements"."student_id"
			and lr.status = 'approved'
	)
	and exists (
		select 1 from "leave_exit_authorizations" lxa
		where lxa.leave_request_id = "movements"."leave_request_id"
	)
);--> statement-breakpoint

-- Realtime (ADR-009): joins the publication directly, the same established
-- pattern F-08/F-QG02-04 already used for leave_approval_events/
-- leave_exit_authorizations. RLS (above) continues to scope exactly which
-- rows each authenticated subscriber's channel receives.
alter publication supabase_realtime add table movements;
