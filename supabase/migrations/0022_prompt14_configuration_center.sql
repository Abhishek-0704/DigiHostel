-- Phase 5, Prompt 14 — Enterprise Configuration Center.
--
-- ============================================================================
-- Reconnaissance before this migration (full grep of every
-- packages/db/src/schema/*.ts file and every supabase/migrations/*.sql file
-- for "config|setting|feature_flag|parameter", case-insensitive) confirmed
-- NO configuration/settings/feature-flag/reference-data table exists
-- anywhere in this schema — this is genuinely new schema surface, not an
-- extension of something pre-existing, and nothing here duplicates an
-- existing source of truth.
--
-- ONE generic table (`configuration_entries`), not the four-table
-- `configuration_domains`/`configuration_entries`/`configuration_metadata`/
-- `configuration_validation_rules` shape the prompt's own text merely lists
-- as a *possible* structure — a single row already carries every field that
-- list names, so a separate `configuration_domains` table would only ever
-- hold a small, effectively-static allow-list of domain names with no
-- independent lifecycle. `domain` is plain `text`, not a `pgEnum`, mirroring
-- `audit_logs.action`/`entity_type`'s own established "free-form text,
-- validated by the application layer" precedent — the allow-list lives in
-- `apps/api/src/domain/configuration/types.ts`'s `CONFIGURATION_DOMAINS` and
-- can grow without a schema migration, while every write is still fully
-- server-validated against it, never client-trusted.
--
-- `hostels`/`rooms` (packages/db/src/schema/hostel.ts) were NOT altered —
-- reconnaissance found they carry only 3/4 columns each (id/name/createdAt;
-- id/hostelId/roomNumber/createdAt), with no block/floor/capacity/reception-
-- desk/warden-assignment/emergency-contact/status column. Adding those
-- directly to `hostels`/`rooms` would be a structural schema change other
-- certified modules (Student Operations, Movement, the room-assignment
-- join table) read from — out of this task's explicit "do not perform an
-- uncontrolled cross-module migration" instruction. Hostel-level operational
-- settings (e.g. an emergency-contact note, a warden-assignment note) are
-- instead ordinary `configuration_entries` rows with `scope = 'hostel'` and
-- `hostel_id` referencing the EXISTING `hostels.id` — no second/parallel
-- hostel table, no new hostel-identity concept.
--
-- RLS: deliberately ZERO policies for any client role — mirrors
-- `audit_logs`'s own established pattern exactly (no SELECT/INSERT/UPDATE/
-- DELETE grant for anon or authenticated; only Fastify's service-role
-- connection, which bypasses RLS entirely, reads/writes this table). Every
-- authorization decision (role via `requireStaffRole`, AAL2 via
-- `requireAal2()`, hostel scope) is made exactly once, in
-- `apps/api/src/domain/configuration/`, not duplicated as a second RLS-layer
-- copy of the same logic — configuration data is exactly as privileged as
-- staff-administration data (Prompt 13's own identical reasoning for
-- `staff`'s super_admin-only mutation surface). A direct PostgREST/Supabase-
-- client read or write from any authenticated role returns zero rows / is
-- rejected — verified by
-- supabase/tests/database/26_prompt14_configuration_center_rls.sql.
--
-- Version column (optimistic concurrency, not a full history table): the
-- prompt's own "CONCURRENT EDITING" section asks to "prevent obviously stale
-- administrative edits from silently overwriting newer values ... at
-- minimum," explicitly warning against "a sophisticated distributed locking
-- system." `version` (incremented by exactly one on every successful
-- update) is that minimum: a caller must supply the version it last read, or
-- the write is rejected (409) rather than silently clobbering a concurrent
-- change. A separate `configuration_history` table was deliberately NOT
-- added — every configuration mutation already writes one `audit_logs` row
-- with before/after metadata (the same table Prompts 12/13 already
-- established as this codebase's one compliance-grade change record), which
-- serves as the real extension point for a future "version comparison" UI
-- without this migration inventing a second, competing history mechanism.
-- ============================================================================

CREATE TYPE "public"."configuration_scope" AS ENUM ('global', 'hostel');--> statement-breakpoint

CREATE TYPE "public"."configuration_value_type" AS ENUM ('string', 'number', 'boolean', 'json');--> statement-breakpoint

CREATE TABLE "configuration_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"value_type" "public"."configuration_value_type" NOT NULL,
	"description" text,
	"scope" "public"."configuration_scope" DEFAULT 'global' NOT NULL,
	"hostel_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "configuration_entries_scope_hostel_consistency" CHECK ((("configuration_entries"."scope" = 'hostel' and "configuration_entries"."hostel_id" is not null) or ("configuration_entries"."scope" = 'global' and "configuration_entries"."hostel_id" is null)))
);--> statement-breakpoint

ALTER TABLE "configuration_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "configuration_entries" ADD CONSTRAINT "configuration_entries_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuration_entries" ADD CONSTRAINT "configuration_entries_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuration_entries" ADD CONSTRAINT "configuration_entries_updated_by_staff_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "configuration_entries_global_key" ON "configuration_entries" USING btree ("domain","key") WHERE "configuration_entries"."scope" = 'global';--> statement-breakpoint
CREATE UNIQUE INDEX "configuration_entries_hostel_key" ON "configuration_entries" USING btree ("domain","key","hostel_id") WHERE "configuration_entries"."scope" = 'hostel';--> statement-breakpoint
CREATE INDEX "configuration_entries_domain_idx" ON "configuration_entries" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "configuration_entries_hostel_id_idx" ON "configuration_entries" USING btree ("hostel_id");
