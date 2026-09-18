-- Phase 4, Prompt 11 — Reception Dashboard Health Operations Center.
--
-- Reconnaissance (see packages/db/src/schema/health.ts's header) found that
-- extending `security_incidents` further (as Prompt 10's own doc comments
-- speculated the future "Health Alerts" module might) would be
-- architecturally unsound: the Emergency Operations Center's own 5-state
-- `open -> closed` lifecycle and its `medical` incident_type value already
-- occupy that table/column for ACUTE, staff-attested incidents, whereas a
-- health case is a materially different, longer-lived case-tracking concept
-- (monitoring, awaiting_update, admission/discharge). This migration
-- therefore creates a NEW table pair, `health_cases`/`health_case_events`,
-- reusing the EOC's own established PATTERN (immutable timeline,
-- forged-actor RLS, hostel scoping) rather than its table. `severity`
-- reuses the existing `security_incident_severity` enum directly — no
-- duplicated vocabulary.
--
-- Unlike migrations 0016/0017 (which had to be split because
-- `ALTER TYPE ... ADD VALUE` cannot be referenced within the same
-- transaction that adds it), this migration only CREATEs brand-new enum
-- types, which carries no such restriction — a single migration file is
-- sufficient and was verified against a clean `supabase db reset`.
--
-- Handwritten, matching this repository's established convention for
-- policy-bearing migrations (drizzle-kit generate requires interactive
-- policy-conflict resolution unavailable in this non-TTY environment),
-- reviewed for exact correspondence with packages/db/src/schema/health.ts.

-- ============================================================================
-- Enums
-- ============================================================================
CREATE TYPE "health_case_category" AS ENUM (
  'hospital_admission', 'medical_observation', 'emergency_admission',
  'outpatient_visit', 'discharge', 'medical_follow_up', 'accident',
  'other_medical_event'
);--> statement-breakpoint
CREATE TYPE "health_case_status" AS ENUM (
  'new', 'acknowledged', 'monitoring', 'awaiting_update', 'resolved',
  'discharged', 'closed', 'cancelled'
);--> statement-breakpoint
CREATE TYPE "health_case_event_type" AS ENUM (
  'created', 'acknowledged', 'monitoring_started', 'awaiting_update',
  'update_received', 'note_added', 'resolved', 'discharge_recorded',
  'closed', 'cancelled'
);--> statement-breakpoint

-- ============================================================================
-- health_cases
-- ============================================================================
CREATE TABLE "health_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"category" "health_case_category" NOT NULL,
	"severity" "security_incident_severity" NOT NULL,
	"status" "health_case_status" DEFAULT 'new' NOT NULL,
	"description" text,
	"assigned_staff_id" uuid,
	"admitted_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"discharged_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "health_cases" ADD CONSTRAINT "health_cases_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_cases" ADD CONSTRAINT "health_cases_assigned_staff_id_staff_id_fk" FOREIGN KEY ("assigned_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "health_cases_student_id_idx" ON "health_cases" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "health_cases_status_idx" ON "health_cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "health_cases_category_status_idx" ON "health_cases" USING btree ("category","status");--> statement-breakpoint
ALTER TABLE "health_cases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "health_cases_select_own_student" ON "health_cases" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("health_cases"."student_id" = public.current_student_id());--> statement-breakpoint
CREATE POLICY "health_cases_select_linked_parent" ON "health_cases" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "parent_student_relationships" psr where psr.student_id = "health_cases"."student_id" and psr.parent_id = public.current_parent_id()));--> statement-breakpoint
CREATE POLICY "health_cases_all_reception" ON "health_cases" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.is_reception_for_student("health_cases"."student_id")) WITH CHECK (public.is_reception_for_student("health_cases"."student_id") and ("health_cases"."assigned_staff_id" is null or "health_cases"."assigned_staff_id" = public.current_staff_id()));--> statement-breakpoint
CREATE POLICY "health_cases_all_hostel_admin" ON "health_cases" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.is_hostel_admin_for_student("health_cases"."student_id")) WITH CHECK (public.is_hostel_admin_for_student("health_cases"."student_id") and ("health_cases"."assigned_staff_id" is null or "health_cases"."assigned_staff_id" = public.current_staff_id()));--> statement-breakpoint
CREATE POLICY "health_cases_all_super_admin" ON "health_cases" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.current_staff_role() = 'super_admin') WITH CHECK (public.current_staff_role() = 'super_admin');--> statement-breakpoint

-- No policy at all for library_incharge — that role has no product reason
-- to manage a medical case (even less reason than the Emergency Operations
-- Center, which at least narrowed an existing global grant; here there is
-- simply nothing to narrow).

-- ============================================================================
-- health_case_events — append-only operational timeline, mirrors
-- security_incident_events exactly.
-- ============================================================================
CREATE TABLE "health_case_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"event_type" "health_case_event_type" NOT NULL,
	"actor_staff_id" uuid,
	"note" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "health_case_events" ADD CONSTRAINT "health_case_events_case_id_health_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."health_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_case_events" ADD CONSTRAINT "health_case_events_actor_staff_id_staff_id_fk" FOREIGN KEY ("actor_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hce_case_id_idx" ON "health_case_events" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "hce_occurred_at_idx" ON "health_case_events" USING btree ("occurred_at");--> statement-breakpoint
ALTER TABLE "health_case_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "hce_select_own_student" ON "health_case_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "health_cases" hc where hc.id = "health_case_events"."case_id" and hc.student_id = public.current_student_id()));--> statement-breakpoint
CREATE POLICY "hce_select_linked_parent" ON "health_case_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "health_cases" hc join "parent_student_relationships" psr on psr.student_id = hc.student_id where hc.id = "health_case_events"."case_id" and psr.parent_id = public.current_parent_id()));--> statement-breakpoint
CREATE POLICY "hce_select_reception" ON "health_case_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "health_cases" hc where hc.id = "health_case_events"."case_id" and public.is_reception_for_student(hc.student_id)));--> statement-breakpoint
CREATE POLICY "hce_select_hostel_admin" ON "health_case_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "health_cases" hc where hc.id = "health_case_events"."case_id" and public.is_hostel_admin_for_student(hc.student_id)));--> statement-breakpoint
CREATE POLICY "hce_select_super_admin" ON "health_case_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (public.current_staff_role() = 'super_admin');--> statement-breakpoint
CREATE POLICY "hce_insert_staff" ON "health_case_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
	"health_case_events"."actor_staff_id" = public.current_staff_id()
	and exists (
		select 1 from "health_cases" hc
		where hc.id = "health_case_events"."case_id"
			and (public.is_reception_for_student(hc.student_id) or public.is_hostel_admin_for_student(hc.student_id))
	)
);--> statement-breakpoint
CREATE POLICY "hce_insert_super_admin" ON "health_case_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (public.current_staff_role() = 'super_admin');--> statement-breakpoint

-- Realtime (ADR-009): both tables join the publication directly, the same
-- established pattern F-08/F-QG02-04/Prompt-10 already used. RLS (above)
-- continues to scope exactly which rows each authenticated subscriber's
-- channel receives.
alter publication supabase_realtime add table health_cases, health_case_events;
