-- Phase 7, Prompt 17 — Administrative Profile & Personal Preferences Center.
--
-- ============================================================================
-- Reconnaissance before this migration confirmed: no personal-preferences,
-- settings, or theme-persistence table exists anywhere in this schema.
-- ThemeContext.tsx's own pre-existing doc comment already names the exact
-- gap this migration closes: "no manual override UI yet — that belongs to a
-- future Settings page (src/pages/SettingsPage.tsx is a placeholder
-- today)". `staff.full_name` already has a working self-update RLS policy
-- (`staff_update_own_limited`, 0009) and remains the editable "display
-- name" field — this migration does not touch `staff` or duplicate that
-- column.
--
-- ONE table (`staff_preferences`), not five, matching `configuration_
-- entries`'s own "one generic table, not four" precedent (0022): a single
-- row per staff member, always loaded/saved together. Named, CHECK-
-- constrained `text` columns for small closed-set settings (theme/density/
-- font_scale/date_format/preferred_contact_method); `jsonb` only for the
-- three genuinely open-ended shapes (notification category preferences,
-- dashboard widget/filter preferences, the shortcuts list), fully
-- app-validated on every write (apps/api/src/domain/profile/types.ts) —
-- never a generic untyped key-value bag.
--
-- RLS: exactly three self-only policies (SELECT/INSERT/UPDATE), each
-- requiring `staff_id = public.current_staff_id()` — the same existing
-- SECURITY DEFINER helper `staff_select_own`/`staff_update_own_limited`
-- already rely on. Deliberately NO super_admin/hostel_admin bypass policy:
-- unlike `staff` itself (an identity record super_admin legitimately
-- administers via Prompt 13's Identity & Access Administration Center),
-- this table holds only personal workspace preferences with no
-- administrative meaning to anyone but their owner — no role in this
-- application has a legitimate product reason to read or write another
-- staff member's personal preferences, so none was granted. A direct
-- PostgREST/Supabase-client attempt by any authenticated staff member to
-- read/write another staff member's row returns zero rows / is rejected —
-- verified by supabase/tests/database/29_prompt17_staff_preferences_rls.sql.
--
-- `staff_id` is NOT NULL UNIQUE (true 1:1 with `staff`, ON DELETE CASCADE)
-- rather than a free-standing PK-as-owner-id — this is deliberately an
-- extension record of an existing identity, not a second identity concept.
-- ============================================================================

CREATE TABLE "staff_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"phone_number" text,
	"office_location" text,
	"bio" text,
	"preferred_contact_method" text DEFAULT 'email' NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"density" text DEFAULT 'comfortable' NOT NULL,
	"font_scale" text DEFAULT 'default' NOT NULL,
	"date_format" text DEFAULT 'DD_MM_YYYY' NOT NULL,
	"reduced_motion" boolean DEFAULT false NOT NULL,
	"high_contrast" boolean DEFAULT false NOT NULL,
	"default_landing_page" text DEFAULT 'dashboard' NOT NULL,
	"notification_preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dashboard_preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"shortcuts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_preferences_staff_id_unique" UNIQUE("staff_id"),
	CONSTRAINT "staff_preferences_preferred_contact_method_check" CHECK ("staff_preferences"."preferred_contact_method" in ('email', 'phone', 'in_app')),
	CONSTRAINT "staff_preferences_theme_check" CHECK ("staff_preferences"."theme" in ('light', 'dark', 'system')),
	CONSTRAINT "staff_preferences_density_check" CHECK ("staff_preferences"."density" in ('comfortable', 'compact')),
	CONSTRAINT "staff_preferences_font_scale_check" CHECK ("staff_preferences"."font_scale" in ('default', 'large', 'larger')),
	CONSTRAINT "staff_preferences_date_format_check" CHECK ("staff_preferences"."date_format" in ('DD_MM_YYYY', 'MM_DD_YYYY', 'YYYY_MM_DD'))
);--> statement-breakpoint

ALTER TABLE "staff_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "staff_preferences" ADD CONSTRAINT "staff_preferences_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "staff_preferences_staff_id_key" ON "staff_preferences" USING btree ("staff_id");--> statement-breakpoint

CREATE POLICY "staff_preferences_select_own" ON "staff_preferences" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("staff_id" = public.current_staff_id());--> statement-breakpoint
CREATE POLICY "staff_preferences_insert_own" ON "staff_preferences" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("staff_id" = public.current_staff_id());--> statement-breakpoint
CREATE POLICY "staff_preferences_update_own" ON "staff_preferences" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("staff_id" = public.current_staff_id()) WITH CHECK ("staff_id" = public.current_staff_id());
