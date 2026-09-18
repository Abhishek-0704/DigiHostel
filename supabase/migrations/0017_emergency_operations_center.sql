-- Phase 4, Prompt 10 — Reception Dashboard Emergency Operations Center (EOC).
--
-- Depends on 0016_emergency_operations_center_enums.sql's new enum labels
-- (must run in a separate, already-committed migration first — see that
-- file's own header).
--
-- Reconnaissance confirmed `security_incidents` (0000_cute_korvac.sql) is
-- the SDD's own single canonical incident table for this whole domain
-- (docs/database.md's entity list; docs/reception-dashboard-architecture.md
-- names it as the intended backing store for BOTH "Emergency Management"
-- and the future "Health Alerts" module) — this migration ADDS the EOC's
-- own severity/description/assignment/closed-at fields to that SAME table
-- and a new, immutable operational-timeline table
-- (security_incident_events, mirrors leave_approval_events's established
-- shape) — not a second, competing "emergency_incidents" table. It also
-- narrows security_incidents_all_library so library_incharge's pre-existing
-- GLOBAL access (unaffected for the original two incident types) does not
-- silently extend to the new emergency categories, which that role has no
-- product reason to manage.
--
-- Every existing row/pgTAP fixture (supabase/tests/database/13.../14...sql)
-- that inserts missed_checkpoint/manual_flag + open/escalated/resolved
-- remains valid and unaffected — all new columns are nullable.
--
-- Handwritten (matches this repository's established convention for
-- policy-bearing migrations — drizzle-kit generate requires interactive
-- policy-conflict resolution unavailable in this non-TTY environment),
-- reviewed for exact correspondence with packages/db/src/schema/audit.ts.

-- ============================================================================
-- security_incidents: additive columns for the EOC. All nullable — the
-- original two incident_type values never populate them; required-at-
-- creation for the new emergency categories is enforced by the application
-- layer (domain/emergency's Zod schema), not a DB NOT NULL constraint that
-- would retroactively invalidate existing rows/fixtures.
-- ============================================================================
ALTER TABLE "security_incidents" ADD COLUMN "severity" "security_incident_severity";--> statement-breakpoint
ALTER TABLE "security_incidents" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "security_incidents" ADD COLUMN "assigned_staff_id" uuid;--> statement-breakpoint
ALTER TABLE "security_incidents" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "security_incidents" ADD CONSTRAINT "security_incidents_assigned_staff_id_staff_id_fk" FOREIGN KEY ("assigned_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "security_incidents_type_status_idx" ON "security_incidents" USING btree ("incident_type","status");--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Re-create the three mutating policies with the EOC's own additional
-- invariants. Pre-existing hostel-scope/role behavior (isReceptionForStudent/
-- isHostelAdminForStudent/isSuperAdmin) is completely unchanged.
-- ----------------------------------------------------------------------------
DROP POLICY "security_incidents_all_reception" ON "security_incidents" CASCADE;--> statement-breakpoint
DROP POLICY "security_incidents_all_library" ON "security_incidents" CASCADE;--> statement-breakpoint
DROP POLICY "security_incidents_all_hostel_admin" ON "security_incidents" CASCADE;--> statement-breakpoint

-- Adds: a direct PostgREST bypass cannot assign an incident to a DIFFERENT
-- staff member's identity (forged-actor defense, same shape as
-- movements_insert_staff's recordedByStaffId check) — a non-null
-- assigned_staff_id must equal the caller's own resolved staff id.
CREATE POLICY "security_incidents_all_reception" ON "security_incidents" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.is_reception_for_student("security_incidents"."student_id")) WITH CHECK (public.is_reception_for_student("security_incidents"."student_id") and ("security_incidents"."assigned_staff_id" is null or "security_incidents"."assigned_staff_id" = public.current_staff_id()));--> statement-breakpoint
CREATE POLICY "security_incidents_all_hostel_admin" ON "security_incidents" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.is_hostel_admin_for_student("security_incidents"."student_id")) WITH CHECK (public.is_hostel_admin_for_student("security_incidents"."student_id") and ("security_incidents"."assigned_staff_id" is null or "security_incidents"."assigned_staff_id" = public.current_staff_id()));--> statement-breakpoint

-- Narrowed: library_incharge's pre-existing GLOBAL access is preserved
-- ONLY for the original two incident_type values it was designed for — it
-- does not silently extend to the eight new emergency categories, which
-- that role has no product reason to create/read/manage.
CREATE POLICY "security_incidents_all_library" ON "security_incidents" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.current_staff_role() = 'library_incharge' and "security_incidents"."incident_type" not in ('medical', 'personal_safety', 'fire', 'security_threat', 'violence', 'infrastructure', 'harassment', 'other')) WITH CHECK (public.current_staff_role() = 'library_incharge' and "security_incidents"."incident_type" not in ('medical', 'personal_safety', 'fire', 'security_threat', 'violence', 'infrastructure', 'harassment', 'other'));--> statement-breakpoint

-- ============================================================================
-- security_incident_events — the EOC's own append-only operational
-- timeline. Mirrors leave_approval_events's established shape/discipline
-- exactly (immutable, RLS-scoped through the parent row's student/hostel
-- relationship). NOT a second audit system: audit_logs (service-role-only)
-- remains the compliance-grade record every mutation also writes to.
-- ============================================================================
CREATE TABLE "security_incident_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"event_type" "security_incident_event_type" NOT NULL,
	"actor_staff_id" uuid,
	"note" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "security_incident_events" ADD CONSTRAINT "security_incident_events_incident_id_security_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."security_incidents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_incident_events" ADD CONSTRAINT "security_incident_events_actor_staff_id_staff_id_fk" FOREIGN KEY ("actor_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sie_incident_id_idx" ON "security_incident_events" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "sie_occurred_at_idx" ON "security_incident_events" USING btree ("occurred_at");--> statement-breakpoint
ALTER TABLE "security_incident_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "sie_select_own_student" ON "security_incident_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "security_incidents" si where si.id = "security_incident_events"."incident_id" and si.student_id = public.current_student_id()));--> statement-breakpoint
CREATE POLICY "sie_select_linked_parent" ON "security_incident_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "security_incidents" si join "parent_student_relationships" psr on psr.student_id = si.student_id where si.id = "security_incident_events"."incident_id" and psr.parent_id = public.current_parent_id()));--> statement-breakpoint
CREATE POLICY "sie_select_reception" ON "security_incident_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "security_incidents" si where si.id = "security_incident_events"."incident_id" and public.is_reception_for_student(si.student_id)));--> statement-breakpoint
CREATE POLICY "sie_select_hostel_admin" ON "security_incident_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "security_incidents" si where si.id = "security_incident_events"."incident_id" and public.is_hostel_admin_for_student(si.student_id)));--> statement-breakpoint
CREATE POLICY "sie_select_super_admin" ON "security_incident_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (public.current_staff_role() = 'super_admin');--> statement-breakpoint
CREATE POLICY "sie_insert_staff" ON "security_incident_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
	"security_incident_events"."actor_staff_id" = public.current_staff_id()
	and exists (
		select 1 from "security_incidents" si
		where si.id = "security_incident_events"."incident_id"
			and (public.is_reception_for_student(si.student_id) or public.is_hostel_admin_for_student(si.student_id))
	)
);--> statement-breakpoint
CREATE POLICY "sie_insert_super_admin" ON "security_incident_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (public.current_staff_role() = 'super_admin');--> statement-breakpoint

-- Realtime (ADR-009): both tables join the publication directly, the same
-- established pattern F-08/F-QG02-04/Prompt-9 already used. RLS (above)
-- continues to scope exactly which rows each authenticated subscriber's
-- channel receives.
alter publication supabase_realtime add table security_incidents, security_incident_events;
