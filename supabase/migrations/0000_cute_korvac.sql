CREATE TYPE "public"."approval_event_type" AS ENUM('notified', 'responded', 'escalated', 'expired', 'manual_override');--> statement-breakpoint
CREATE TYPE "public"."approval_response" AS ENUM('approved', 'rejected', 'no_response');--> statement-breakpoint
CREATE TYPE "public"."attestation_provider" AS ENUM('play_integrity', 'app_attest', 'device_check');--> statement-breakpoint
CREATE TYPE "public"."attestation_result" AS ENUM('pass', 'fail');--> statement-breakpoint
CREATE TYPE "public"."audit_actor_type" AS ENUM('student', 'parent', 'staff', 'system');--> statement-breakpoint
CREATE TYPE "public"."checkpoint_type" AS ENUM('hostel_exit', 'library_entry', 'library_exit', 'hostel_return');--> statement-breakpoint
CREATE TYPE "public"."device_platform" AS ENUM('ios', 'android');--> statement-breakpoint
CREATE TYPE "public"."leave_request_status" AS ENUM('pending', 'father_notified', 'mother_notified', 'guardian_notified', 'approved', 'rejected', 'in_app_call', 'manual_verification', 'expired');--> statement-breakpoint
CREATE TYPE "public"."library_pass_status" AS ENUM('active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."notification_recipient_type" AS ENUM('parent', 'student');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('queued', 'sent', 'delivered', 'failed');--> statement-breakpoint
CREATE TYPE "public"."parent_relationship_type" AS ENUM('father', 'mother', 'guardian');--> statement-breakpoint
CREATE TYPE "public"."security_incident_status" AS ENUM('open', 'escalated', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."security_incident_type" AS ENUM('missed_checkpoint', 'manual_flag');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('reception_warden', 'library_incharge', 'hostel_admin', 'super_admin');--> statement-breakpoint
CREATE TABLE "parent_student_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"relationship_type" "parent_relationship_type" NOT NULL,
	"escalation_order" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "parent_student_relationships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "parents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" uuid,
	"full_name" text NOT NULL,
	"phone_number" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "parents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"role" "staff_role" NOT NULL,
	"hostel_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" uuid,
	"roll_number" text NOT NULL,
	"full_name" text NOT NULL,
	"hostel_id" uuid,
	"room_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "hostels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hostels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hostel_id" uuid NOT NULL,
	"room_number" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rooms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "student_room_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "student_room_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "leave_approval_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"leave_request_id" uuid NOT NULL,
	"event_type" "approval_event_type" NOT NULL,
	"actor_parent_id" uuid,
	"actor_staff_id" uuid,
	"response" "approval_response",
	"biometric_confirmed" boolean DEFAULT false NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leave_approval_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "leave_request_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leave_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "device_attestation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trusted_device_id" uuid NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"result" "attestation_result" NOT NULL,
	"provider" "attestation_provider" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device_attestation_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trusted_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid NOT NULL,
	"platform" "device_platform" NOT NULL,
	"device_fingerprint" text NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text
);
--> statement-breakpoint
ALTER TABLE "trusted_devices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "journey_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"library_pass_id" uuid NOT NULL,
	"qr_session_id" uuid NOT NULL,
	"checkpoint_type" "checkpoint_type" NOT NULL,
	"verified_by_staff_id" uuid NOT NULL,
	"biometric_confirmed" boolean NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "journey_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "library_passes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "library_pass_status" DEFAULT 'active' NOT NULL,
	"expected_return_by" timestamp with time zone,
	"is_overdue" boolean DEFAULT false NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "library_passes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "qr_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"library_pass_id" uuid NOT NULL,
	"checkpoint_type" "checkpoint_type" NOT NULL,
	"token_hash" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_by_staff_id" uuid
);
--> statement-breakpoint
ALTER TABLE "qr_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_type" "notification_recipient_type" NOT NULL,
	"recipient_id" uuid NOT NULL,
	"related_leave_request_id" uuid,
	"related_library_pass_id" uuid,
	"status" "notification_status" DEFAULT 'queued' NOT NULL,
	"retry_count" smallint DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" "audit_actor_type" NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "security_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"incident_type" "security_incident_type" NOT NULL,
	"status" "security_incident_status" DEFAULT 'open' NOT NULL,
	"geolocation" jsonb,
	"geolocation_captured_at" timestamp with time zone,
	"geolocation_deleted_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "security_incidents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "parent_student_relationships" ADD CONSTRAINT "parent_student_relationships_parent_id_parents_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_student_relationships" ADD CONSTRAINT "parent_student_relationships_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parents" ADD CONSTRAINT "parents_auth_user_id_users_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_auth_user_id_users_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_auth_user_id_users_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_room_assignments" ADD CONSTRAINT "student_room_assignments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_room_assignments" ADD CONSTRAINT "student_room_assignments_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_approval_events" ADD CONSTRAINT "leave_approval_events_leave_request_id_leave_requests_id_fk" FOREIGN KEY ("leave_request_id") REFERENCES "public"."leave_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_attestation_events" ADD CONSTRAINT "device_attestation_events_trusted_device_id_trusted_devices_id_fk" FOREIGN KEY ("trusted_device_id") REFERENCES "public"."trusted_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_parent_id_parents_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_events" ADD CONSTRAINT "journey_events_library_pass_id_library_passes_id_fk" FOREIGN KEY ("library_pass_id") REFERENCES "public"."library_passes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_events" ADD CONSTRAINT "journey_events_qr_session_id_qr_sessions_id_fk" FOREIGN KEY ("qr_session_id") REFERENCES "public"."qr_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_events" ADD CONSTRAINT "journey_events_verified_by_staff_id_staff_id_fk" FOREIGN KEY ("verified_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_passes" ADD CONSTRAINT "library_passes_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_sessions" ADD CONSTRAINT "qr_sessions_library_pass_id_library_passes_id_fk" FOREIGN KEY ("library_pass_id") REFERENCES "public"."library_passes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_sessions" ADD CONSTRAINT "qr_sessions_used_by_staff_id_staff_id_fk" FOREIGN KEY ("used_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_related_leave_request_id_leave_requests_id_fk" FOREIGN KEY ("related_leave_request_id") REFERENCES "public"."leave_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_related_library_pass_id_library_passes_id_fk" FOREIGN KEY ("related_library_pass_id") REFERENCES "public"."library_passes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_incidents" ADD CONSTRAINT "security_incidents_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "psr_parent_student_key" ON "parent_student_relationships" USING btree ("parent_id","student_id");--> statement-breakpoint
CREATE INDEX "psr_student_id_idx" ON "parent_student_relationships" USING btree ("student_id","escalation_order");--> statement-breakpoint
CREATE INDEX "psr_parent_id_idx" ON "parent_student_relationships" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "parents_auth_user_id_key" ON "parents" USING btree ("auth_user_id");--> statement-breakpoint
CREATE INDEX "parents_phone_number_idx" ON "parents" USING btree ("phone_number");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_auth_user_id_key" ON "staff" USING btree ("auth_user_id");--> statement-breakpoint
CREATE INDEX "staff_role_idx" ON "staff" USING btree ("role");--> statement-breakpoint
CREATE INDEX "staff_hostel_id_idx" ON "staff" USING btree ("hostel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "students_roll_number_key" ON "students" USING btree ("roll_number");--> statement-breakpoint
CREATE UNIQUE INDEX "students_auth_user_id_key" ON "students" USING btree ("auth_user_id");--> statement-breakpoint
CREATE INDEX "students_hostel_id_idx" ON "students" USING btree ("hostel_id");--> statement-breakpoint
CREATE INDEX "students_room_id_idx" ON "students" USING btree ("room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hostels_name_key" ON "hostels" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_hostel_room_key" ON "rooms" USING btree ("hostel_id","room_number");--> statement-breakpoint
CREATE UNIQUE INDEX "sra_current_assignment_key" ON "student_room_assignments" USING btree ("student_id") WHERE "student_room_assignments"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "sra_student_id_idx" ON "student_room_assignments" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "lae_leave_request_id_idx" ON "leave_approval_events" USING btree ("leave_request_id");--> statement-breakpoint
CREATE INDEX "lae_occurred_at_idx" ON "leave_approval_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "leave_requests_student_id_idx" ON "leave_requests" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "leave_requests_status_idx" ON "leave_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "dae_trusted_device_id_idx" ON "device_attestation_events" USING btree ("trusted_device_id");--> statement-breakpoint
CREATE INDEX "dae_checked_at_idx" ON "device_attestation_events" USING btree ("checked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trusted_devices_parent_fingerprint_key" ON "trusted_devices" USING btree ("parent_id","device_fingerprint");--> statement-breakpoint
CREATE INDEX "trusted_devices_parent_id_idx" ON "trusted_devices" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "trusted_devices_active_idx" ON "trusted_devices" USING btree ("parent_id") WHERE "trusted_devices"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "journey_events_library_pass_id_idx" ON "journey_events" USING btree ("library_pass_id");--> statement-breakpoint
CREATE INDEX "journey_events_occurred_at_idx" ON "journey_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "library_passes_student_id_idx" ON "library_passes" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "library_passes_active_idx" ON "library_passes" USING btree ("student_id") WHERE "library_passes"."status" = 'active';--> statement-breakpoint
CREATE INDEX "library_passes_overdue_idx" ON "library_passes" USING btree ("is_overdue");--> statement-breakpoint
CREATE INDEX "qr_sessions_library_pass_id_idx" ON "qr_sessions" USING btree ("library_pass_id");--> statement-breakpoint
CREATE INDEX "qr_sessions_expires_at_idx" ON "qr_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "notifications_recipient_idx" ON "notifications" USING btree ("recipient_type","recipient_id");--> statement-breakpoint
CREATE INDEX "notifications_status_idx" ON "notifications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_occurred_at_idx" ON "audit_logs" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "security_incidents_student_id_idx" ON "security_incidents" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "security_incidents_status_idx" ON "security_incidents" USING btree ("status");--> statement-breakpoint
-- RLS helper functions (hand-added; not generated by drizzle-kit — Drizzle's
-- schema DSL in this version has no CREATE FUNCTION support). SECURITY
-- DEFINER, owned by the migration-running role (the table owner), which
-- Postgres does not subject to RLS by default (FORCE ROW LEVEL SECURITY is
-- not set on any table here). Required, not stylistic — found empirically
-- while testing this migration against a real local instance:
--   1. A raw subquery against "staff" inside one of staff's OWN policies
--      causes "infinite recursion detected in policy for relation staff".
--   2. "students" and "parent_student_relationships" policies that reference
--      EACH OTHER via raw EXISTS subqueries form the same kind of cycle
--      across two tables — is_parent_linked_to_student/is_hostel_admin_for_student
--      below specifically break that cycle.
-- See packages/db/src/schema/rls-helpers.ts for the TypeScript side.
CREATE FUNCTION public.current_parent_id() RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  select id from parents where auth_user_id = auth.uid()
$$;--> statement-breakpoint
CREATE FUNCTION public.current_student_id() RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  select id from students where auth_user_id = auth.uid()
$$;--> statement-breakpoint
CREATE FUNCTION public.current_staff_id() RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  select id from staff where auth_user_id = auth.uid()
$$;--> statement-breakpoint
CREATE FUNCTION public.current_staff_role() RETURNS staff_role LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  select role from staff where auth_user_id = auth.uid()
$$;--> statement-breakpoint
CREATE FUNCTION public.current_staff_hostel_id() RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  select hostel_id from staff where auth_user_id = auth.uid()
$$;--> statement-breakpoint
CREATE FUNCTION public.is_parent_linked_to_student(p_student_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  select exists (
    select 1 from parent_student_relationships psr
    where psr.student_id = p_student_id and psr.parent_id = public.current_parent_id()
  )
$$;--> statement-breakpoint
CREATE FUNCTION public.is_hostel_admin_for_student(p_student_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  select public.current_staff_role() = 'hostel_admin' and exists (
    select 1 from students s where s.id = p_student_id and s.hostel_id = public.current_staff_hostel_id()
  )
$$;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.current_parent_id() TO authenticated, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.current_student_id() TO authenticated, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.current_staff_id() TO authenticated, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.current_staff_role() TO authenticated, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.current_staff_hostel_id() TO authenticated, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.is_parent_linked_to_student(uuid) TO authenticated, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.is_hostel_admin_for_student(uuid) TO authenticated, anon;--> statement-breakpoint
CREATE POLICY "psr_select_own_student" ON "parent_student_relationships" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("parent_student_relationships"."student_id" = public.current_student_id());--> statement-breakpoint
CREATE POLICY "psr_select_own_parent" ON "parent_student_relationships" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("parent_student_relationships"."parent_id" = public.current_parent_id());--> statement-breakpoint
CREATE POLICY "psr_all_hostel_admin" ON "parent_student_relationships" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.is_hostel_admin_for_student("parent_student_relationships"."student_id")) WITH CHECK (public.is_hostel_admin_for_student("parent_student_relationships"."student_id"));--> statement-breakpoint
CREATE POLICY "psr_all_super_admin" ON "parent_student_relationships" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.current_staff_role() = 'super_admin') WITH CHECK (public.current_staff_role() = 'super_admin');--> statement-breakpoint
CREATE POLICY "parents_select_own" ON "parents" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("parents"."auth_user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "parents_update_own" ON "parents" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("parents"."auth_user_id" = auth.uid()) WITH CHECK ("parents"."auth_user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "parents_all_hostel_admin" ON "parents" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.current_staff_role() = 'hostel_admin') WITH CHECK (public.current_staff_role() = 'hostel_admin');--> statement-breakpoint
CREATE POLICY "parents_all_super_admin" ON "parents" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.current_staff_role() = 'super_admin') WITH CHECK (public.current_staff_role() = 'super_admin');--> statement-breakpoint
CREATE POLICY "staff_select_own" ON "staff" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("staff"."auth_user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "staff_update_own_limited" ON "staff" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("staff"."auth_user_id" = auth.uid()) WITH CHECK ("staff"."auth_user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "staff_all_super_admin" ON "staff" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.current_staff_role() = 'super_admin') WITH CHECK (public.current_staff_role() = 'super_admin');--> statement-breakpoint
CREATE POLICY "students_select_own" ON "students" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("students"."auth_user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "students_update_own" ON "students" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("students"."auth_user_id" = auth.uid()) WITH CHECK ("students"."auth_user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "students_select_linked_parent" ON "students" AS PERMISSIVE FOR SELECT TO "authenticated" USING (public.is_parent_linked_to_student("students"."id"));--> statement-breakpoint
CREATE POLICY "students_select_own_hostel_reception" ON "students" AS PERMISSIVE FOR SELECT TO "authenticated" USING (public.current_staff_role() = 'reception_warden' and "students"."hostel_id" = public.current_staff_hostel_id());--> statement-breakpoint
CREATE POLICY "students_select_library_incharge" ON "students" AS PERMISSIVE FOR SELECT TO "authenticated" USING (public.current_staff_role() = 'library_incharge');--> statement-breakpoint
CREATE POLICY "students_all_hostel_admin" ON "students" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.current_staff_role() = 'hostel_admin' and "students"."hostel_id" = public.current_staff_hostel_id()) WITH CHECK (public.current_staff_role() = 'hostel_admin' and "students"."hostel_id" = public.current_staff_hostel_id());--> statement-breakpoint
CREATE POLICY "students_all_super_admin" ON "students" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.current_staff_role() = 'super_admin') WITH CHECK (public.current_staff_role() = 'super_admin');--> statement-breakpoint
CREATE POLICY "hostels_select_authenticated" ON "hostels" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "hostels_all_super_admin" ON "hostels" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.current_staff_role() = 'super_admin') WITH CHECK (public.current_staff_role() = 'super_admin');--> statement-breakpoint
CREATE POLICY "rooms_select_authenticated" ON "rooms" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "rooms_all_hostel_admin" ON "rooms" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.current_staff_role() = 'hostel_admin' and "rooms"."hostel_id" = public.current_staff_hostel_id()) WITH CHECK (public.current_staff_role() = 'hostel_admin' and "rooms"."hostel_id" = public.current_staff_hostel_id());--> statement-breakpoint
CREATE POLICY "rooms_all_super_admin" ON "rooms" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.current_staff_role() = 'super_admin') WITH CHECK (public.current_staff_role() = 'super_admin');--> statement-breakpoint
CREATE POLICY "sra_select_own_student" ON "student_room_assignments" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from students s where s.id = "student_room_assignments"."student_id" and s.auth_user_id = auth.uid()));--> statement-breakpoint
CREATE POLICY "sra_select_linked_parent" ON "student_room_assignments" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "parent_student_relationships" psr where psr.student_id = "student_room_assignments"."student_id" and psr.parent_id = public.current_parent_id()));--> statement-breakpoint
CREATE POLICY "sra_all_hostel_admin" ON "student_room_assignments" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.current_staff_role() = 'hostel_admin' and exists (select 1 from rooms r where r.id = "student_room_assignments"."room_id" and r.hostel_id = public.current_staff_hostel_id())) WITH CHECK (public.current_staff_role() = 'hostel_admin' and exists (select 1 from rooms r where r.id = "student_room_assignments"."room_id" and r.hostel_id = public.current_staff_hostel_id()));--> statement-breakpoint
CREATE POLICY "sra_all_super_admin" ON "student_room_assignments" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.current_staff_role() = 'super_admin') WITH CHECK (public.current_staff_role() = 'super_admin');--> statement-breakpoint
CREATE POLICY "lae_select_own_student" ON "leave_approval_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "leave_requests" lr where lr.id = "leave_approval_events"."leave_request_id" and lr.student_id = public.current_student_id()));--> statement-breakpoint
CREATE POLICY "lae_select_linked_parent" ON "leave_approval_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "leave_requests" lr join "parent_student_relationships" psr on psr.student_id = lr.student_id where lr.id = "leave_approval_events"."leave_request_id" and psr.parent_id = public.current_parent_id()));--> statement-breakpoint
CREATE POLICY "lae_insert_own_parent_response" ON "leave_approval_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        "leave_approval_events"."actor_parent_id" = public.current_parent_id()
        and exists (
          select 1 from "leave_requests" lr
          join "parent_student_relationships" psr on psr.student_id = lr.student_id
          where lr.id = "leave_approval_events"."leave_request_id" and psr.parent_id = public.current_parent_id()
        )
        and ("leave_approval_events"."response" is null or "leave_approval_events"."biometric_confirmed" = true)
        and (
          "leave_approval_events"."response" is null
          or exists (
            select 1 from trusted_devices td
            where td.parent_id = public.current_parent_id() and td.revoked_at is null
          )
        )
      );--> statement-breakpoint
CREATE POLICY "lae_select_staff" ON "leave_approval_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from staff s where s.auth_user_id = auth.uid()));--> statement-breakpoint
CREATE POLICY "lae_insert_reception_manual_override" ON "leave_approval_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        "leave_approval_events"."event_type" = 'manual_override'
        and "leave_approval_events"."actor_staff_id" = public.current_staff_id()
        and exists (
          select 1 from "staff" s join "leave_requests" lr on true
          join "students" st on st.id = lr.student_id
          where s.auth_user_id = auth.uid() and lr.id = "leave_approval_events"."leave_request_id" and st.hostel_id = s.hostel_id
        )
      );--> statement-breakpoint
CREATE POLICY "lae_insert_super_admin" ON "leave_approval_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (public.current_staff_role() = 'super_admin');--> statement-breakpoint
CREATE POLICY "leave_requests_select_own_student" ON "leave_requests" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("leave_requests"."student_id" = public.current_student_id());--> statement-breakpoint
CREATE POLICY "leave_requests_insert_own_student" ON "leave_requests" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("leave_requests"."student_id" = public.current_student_id());--> statement-breakpoint
CREATE POLICY "leave_requests_select_linked_parent" ON "leave_requests" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "parent_student_relationships" psr where psr.student_id = "leave_requests"."student_id" and psr.parent_id = public.current_parent_id()));--> statement-breakpoint
CREATE POLICY "leave_requests_update_linked_parent" ON "leave_requests" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (exists (select 1 from "parent_student_relationships" psr where psr.student_id = "leave_requests"."student_id" and psr.parent_id = public.current_parent_id())) WITH CHECK (exists (select 1 from "parent_student_relationships" psr where psr.student_id = "leave_requests"."student_id" and psr.parent_id = public.current_parent_id()));--> statement-breakpoint
CREATE POLICY "leave_requests_all_reception" ON "leave_requests" AS PERMISSIVE FOR ALL TO "authenticated" USING (exists (select 1 from "staff" s join "students" st on st.hostel_id = s.hostel_id where s.auth_user_id = auth.uid() and s.role = 'reception_warden' and st.id = "leave_requests"."student_id")) WITH CHECK (exists (select 1 from "staff" s join "students" st on st.hostel_id = s.hostel_id where s.auth_user_id = auth.uid() and s.role = 'reception_warden' and st.id = "leave_requests"."student_id"));--> statement-breakpoint
CREATE POLICY "leave_requests_all_hostel_admin" ON "leave_requests" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.current_staff_role() = 'hostel_admin' and exists (select 1 from "students" st where st.id = "leave_requests"."student_id" and st.hostel_id = public.current_staff_hostel_id())) WITH CHECK (public.current_staff_role() = 'hostel_admin' and exists (select 1 from "students" st where st.id = "leave_requests"."student_id" and st.hostel_id = public.current_staff_hostel_id()));--> statement-breakpoint
CREATE POLICY "leave_requests_all_super_admin" ON "leave_requests" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.current_staff_role() = 'super_admin') WITH CHECK (public.current_staff_role() = 'super_admin');--> statement-breakpoint
CREATE POLICY "dae_select_own" ON "device_attestation_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "trusted_devices" td where td.id = "device_attestation_events"."trusted_device_id" and td.parent_id = public.current_parent_id()));--> statement-breakpoint
CREATE POLICY "trusted_devices_select_own" ON "trusted_devices" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("trusted_devices"."parent_id" = public.current_parent_id());--> statement-breakpoint
CREATE POLICY "trusted_devices_insert_own" ON "trusted_devices" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("trusted_devices"."parent_id" = public.current_parent_id());--> statement-breakpoint
CREATE POLICY "trusted_devices_revoke_own" ON "trusted_devices" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("trusted_devices"."parent_id" = public.current_parent_id()) WITH CHECK ("trusted_devices"."parent_id" = public.current_parent_id());--> statement-breakpoint
CREATE POLICY "trusted_devices_all_super_admin" ON "trusted_devices" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.current_staff_role() = 'super_admin') WITH CHECK (public.current_staff_role() = 'super_admin');--> statement-breakpoint
CREATE POLICY "journey_events_select_own_student" ON "journey_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "library_passes" lp where lp.id = "journey_events"."library_pass_id" and lp.student_id = public.current_student_id()));--> statement-breakpoint
CREATE POLICY "journey_events_select_linked_parent" ON "journey_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "library_passes" lp join "parent_student_relationships" psr on psr.student_id = lp.student_id where lp.id = "journey_events"."library_pass_id" and psr.parent_id = public.current_parent_id()));--> statement-breakpoint
CREATE POLICY "journey_events_insert_reception_library" ON "journey_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        (public.current_staff_role() = 'reception_warden' or public.current_staff_role() = 'library_incharge')
        and "journey_events"."verified_by_staff_id" = public.current_staff_id()
        and "journey_events"."biometric_confirmed" = true
      );--> statement-breakpoint
CREATE POLICY "journey_events_select_reception_library" ON "journey_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (public.current_staff_role() = 'reception_warden' or public.current_staff_role() = 'library_incharge');--> statement-breakpoint
CREATE POLICY "journey_events_all_super_admin" ON "journey_events" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.current_staff_role() = 'super_admin') WITH CHECK (public.current_staff_role() = 'super_admin');--> statement-breakpoint
CREATE POLICY "library_passes_select_own_student" ON "library_passes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("library_passes"."student_id" = public.current_student_id());--> statement-breakpoint
CREATE POLICY "library_passes_insert_own_student" ON "library_passes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("library_passes"."student_id" = public.current_student_id());--> statement-breakpoint
CREATE POLICY "library_passes_select_linked_parent" ON "library_passes" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "parent_student_relationships" psr where psr.student_id = "library_passes"."student_id" and psr.parent_id = public.current_parent_id()));--> statement-breakpoint
CREATE POLICY "library_passes_all_reception" ON "library_passes" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.current_staff_role() = 'reception_warden' and exists (select 1 from "students" st where st.id = "library_passes"."student_id" and st.hostel_id = public.current_staff_hostel_id())) WITH CHECK (public.current_staff_role() = 'reception_warden' and exists (select 1 from "students" st where st.id = "library_passes"."student_id" and st.hostel_id = public.current_staff_hostel_id()));--> statement-breakpoint
CREATE POLICY "library_passes_all_library_incharge" ON "library_passes" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.current_staff_role() = 'library_incharge') WITH CHECK (public.current_staff_role() = 'library_incharge');--> statement-breakpoint
CREATE POLICY "library_passes_all_super_admin" ON "library_passes" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.current_staff_role() = 'super_admin') WITH CHECK (public.current_staff_role() = 'super_admin');--> statement-breakpoint
CREATE POLICY "qr_sessions_select_own_student" ON "qr_sessions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "library_passes" lp where lp.id = "qr_sessions"."library_pass_id" and lp.student_id = public.current_student_id()));--> statement-breakpoint
CREATE POLICY "qr_sessions_all_reception_library" ON "qr_sessions" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.current_staff_role() = 'reception_warden' or public.current_staff_role() = 'library_incharge') WITH CHECK (public.current_staff_role() = 'reception_warden' or public.current_staff_role() = 'library_incharge');--> statement-breakpoint
CREATE POLICY "qr_sessions_all_super_admin" ON "qr_sessions" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.current_staff_role() = 'super_admin') WITH CHECK (public.current_staff_role() = 'super_admin');--> statement-breakpoint
CREATE POLICY "notifications_select_own_parent" ON "notifications" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("notifications"."recipient_type" = 'parent' and "notifications"."recipient_id" = public.current_parent_id());--> statement-breakpoint
CREATE POLICY "notifications_select_own_student" ON "notifications" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("notifications"."recipient_type" = 'student' and "notifications"."recipient_id" = public.current_student_id());--> statement-breakpoint
CREATE POLICY "notifications_select_super_admin" ON "notifications" AS PERMISSIVE FOR SELECT TO "authenticated" USING (public.current_staff_role() = 'super_admin');--> statement-breakpoint
CREATE POLICY "security_incidents_select_own_student" ON "security_incidents" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("security_incidents"."student_id" = public.current_student_id());--> statement-breakpoint
CREATE POLICY "security_incidents_select_linked_parent" ON "security_incidents" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "parent_student_relationships" psr where psr.student_id = "security_incidents"."student_id" and psr.parent_id = public.current_parent_id()));--> statement-breakpoint
CREATE POLICY "security_incidents_all_reception_library" ON "security_incidents" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.current_staff_role() = 'reception_warden' or public.current_staff_role() = 'library_incharge') WITH CHECK (public.current_staff_role() = 'reception_warden' or public.current_staff_role() = 'library_incharge');--> statement-breakpoint
CREATE POLICY "security_incidents_all_hostel_admin" ON "security_incidents" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.current_staff_role() = 'hostel_admin') WITH CHECK (public.current_staff_role() = 'hostel_admin');--> statement-breakpoint
CREATE POLICY "security_incidents_all_super_admin" ON "security_incidents" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.current_staff_role() = 'super_admin') WITH CHECK (public.current_staff_role() = 'super_admin');