-- Phase 5, Prompt 13 — Identity & Access Administration Center.
--
-- ============================================================================
-- Adds the minimal, safe lifecycle representation this feature genuinely
-- needs: `staff.status` (`active`/`suspended`), NOT a speculative lock/
-- archive/deactivate taxonomy invented for a UI. Reconnaissance before this
-- migration was written confirmed `staff` had NO status/active column of any
-- kind — "deactivate a staff member" was structurally impossible before this
-- change, not merely unbuilt in the UI.
--
-- Enforcement is request-time, not merely "hide the row in a list": Fastify's
-- own per-request identity-resolution query (`findStaffByAuthUserId`,
-- apps/api/src/lib/auth/db-port.ts) is updated in the SAME task to filter
-- `status = 'active'`, so a suspended staff member's very next authenticated
-- request fails closed with 401 `no_app_profile` — regardless of how long
-- their already-issued Supabase JWT remains technically valid. This reuses
-- the identical resolution mechanism every other identity check in this
-- codebase already depends on; it is not a new enforcement point.
--
-- CRITICAL: the existing `staff_self_update_column_guard` trigger
-- (0009_qg01_staff_privilege_column_protection.sql) is a DENY-LIST of
-- specific named OLD/NEW columns (id, auth_user_id, role, hostel_id,
-- created_at) — NOT an allow-list of "only full_name/updated_at may
-- change." Simply adding `status` as a new column would NOT have been
-- automatically covered by that guard; a non-super-admin's own
-- `staff_update_own_limited` RLS policy only restricts WHICH ROW they may
-- update, never WHICH COLUMNS — the column-level restriction is ENTIRELY
-- this trigger's responsibility. This migration therefore explicitly
-- extends the trigger's deny-list to also reject `new.status is distinct
-- from old.status` for any non-super-admin caller — closing the exact class
-- of gap QG-01 (F-QG01-01) and F-QG03-09 already taught this project to
-- watch for, rather than leaving it for a future reviewer to rediscover.
-- (In practice a suspended staff member also cannot even reach this
-- self-update path at all once suspended, since their next request is
-- already denied at authentication — but the trigger is fixed explicitly
-- rather than relying on that as the only defense, per this project's own
-- established defense-in-depth discipline.)
--
-- SECOND, INDEPENDENTLY DISCOVERED BUG in this same trigger (found while
-- writing this task's own real-Postgres integration test —
-- domain/staff/repository.integration.test.ts): the trigger is
-- `SECURITY INVOKER` and its early-return check is
-- `current_staff_role() = 'super_admin'`, which itself resolves via
-- `auth.uid()`. A trigger fires for EVERY UPDATE regardless of RLS —
-- unlike RLS *policies*, which Fastify's service-role Postgres connection
-- (ADR-006/ADR-014) already fully bypasses, a *trigger* is not a policy
-- and is NOT bypassed by that same connection. That service-role
-- connection has no Supabase Auth JWT context at all, so `auth.uid()` is
-- NULL there, `current_staff_role()` is therefore NULL, and
-- `NULL = 'super_admin'` is NULL (never true) — meaning, before this fix,
-- Fastify's OWN trusted backend could never update `role`/`hostel_id`/
-- `status` on any `staff` row at all, contradicting the "service-role is
-- fully trusted, bypasses everything" model every other table in this
-- schema already relies on. No prior repository had ever attempted such
-- an UPDATE before this task (staff.role/hostel_id were, until now, never
-- written by any Fastify route), so this was a genuinely latent,
-- previously-unexercised bug, not a regression. Fixed by also exempting
-- `auth.uid() is null` — a connection with NO Supabase Auth session
-- context at all is, by this project's own established architecture,
-- already the MOST trusted connection this database ever sees (it
-- already bypasses RLS entirely); the trigger denying it anyway was an
-- inconsistency, not a deliberate extra protection.
-- ============================================================================

CREATE TYPE "public"."staff_status" AS ENUM ('active', 'suspended');--> statement-breakpoint

ALTER TABLE "staff" ADD COLUMN "status" "public"."staff_status" NOT NULL DEFAULT 'active';--> statement-breakpoint

CREATE INDEX "staff_status_idx" ON "staff" USING btree ("status");--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.staff_enforce_self_update_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
begin
  if auth.uid() is null or public.current_staff_role() = 'super_admin' then
    return new;
  end if;

  if new.id is distinct from old.id
    or new.auth_user_id is distinct from old.auth_user_id
    or new.role is distinct from old.role
    or new.hostel_id is distinct from old.hostel_id
    or new.status is distinct from old.status
    or new.created_at is distinct from old.created_at
  then
    raise exception 'staff: only full_name/updated_at may be changed by self-update'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
