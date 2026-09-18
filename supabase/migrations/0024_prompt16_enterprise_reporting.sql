-- Phase 6, Prompt 16 — Enterprise Reporting Platform.
--
-- ============================================================================
-- Reconnaissance before this migration (full grep of every
-- packages/db/src/schema/*.ts file for "template|favourite|favorite|
-- report_history|report_execution") confirmed no existing table represents a
-- staff member's own saved report configuration, or a record of when a
-- report was generated — genuinely new schema, not an extension of
-- something pre-existing.
--
-- Two small, focused tables, mirroring `configuration_entries`'s own
-- precedent (Prompt 14) exactly rather than the larger multi-table model
-- this prompt's own text merely lists as a *possible* structure:
--
-- `report_templates` — a staff member's own saved, reusable report
-- configuration (report id + selected fields + filters + a name), with an
-- `is_favorite` flag doing double duty as "favourites" so a second table
-- isn't needed for that structurally identical concept. Personal, never
-- organization-wide/shared — scoped by `staff_id` alone.
--
-- `report_executions` — a minimal execution-history record, deliberately
-- distinct from both a saved template (a configuration, not an event) and a
-- generated artifact (no PDF/XLSX/CSV file is ever produced by this
-- platform). One row per successful preview/generate call. `audit_logs` was
-- deliberately NOT reused for this: report generation is a READ, not a
-- mutation, and `audit_logs.entity_id` is NOT NULL with no natural "report
-- definition" entity to reference.
--
-- RLS: deliberately ZERO policies for any client role on both tables —
-- mirrors `audit_logs`'s/`configuration_entries`'s own established pattern
-- exactly. Only Fastify's service-role connection (bypasses RLS) reads/
-- writes these tables; every authorization decision (role, AAL2,
-- reports:view/reports:generate permission, hostel scope, template
-- ownership) is made exactly once, in `apps/api/src/domain/reports/`.
-- ============================================================================

CREATE TABLE "report_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"report_id" text NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"selected_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "report_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" text NOT NULL,
	"requested_by_staff_id" uuid NOT NULL,
	"hostel_scope_id" uuid,
	"filters_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"row_count" integer NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "report_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "report_executions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "report_templates" ADD CONSTRAINT "report_templates_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_executions" ADD CONSTRAINT "report_executions_requested_by_staff_id_staff_id_fk" FOREIGN KEY ("requested_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_executions" ADD CONSTRAINT "report_executions_hostel_scope_id_hostels_id_fk" FOREIGN KEY ("hostel_scope_id") REFERENCES "public"."hostels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "report_templates_staff_name_key" ON "report_templates" USING btree ("staff_id","name");--> statement-breakpoint
CREATE INDEX "report_templates_staff_id_idx" ON "report_templates" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "report_templates_report_id_idx" ON "report_templates" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "report_executions_staff_generated_idx" ON "report_executions" USING btree ("requested_by_staff_id","generated_at");--> statement-breakpoint
CREATE INDEX "report_executions_report_id_idx" ON "report_executions" USING btree ("report_id");
