-- QG-01 (Authentication & Security Review), Finding F-QG01-01 remediation —
-- BLOCKER: staff self-privilege-escalation.
--
-- Root cause: `staff_update_own_limited` (packages/db/src/schema/identity.ts)
-- restricts WHICH ROW a staff member may self-update (their own, via
-- auth_user_id = auth.uid()) but never restricted WHICH COLUMNS — RLS
-- USING/WITH CHECK clauses constrain rows, not columns. That schema file's
-- own comment already flagged this exact gap ("Column-level restriction...
-- enforced via a dedicated view/grant at implementation time") but the
-- follow-through never happened, and `authenticated` was left holding a
-- blanket table-level UPDATE grant on every column of `staff`, including
-- `role` and `hostel_id` (confirmed empirically via
-- information_schema.column_privileges during the QG-01 review).
--
-- Impact, empirically proven live during QG-01 (not merely theorized): a
-- real `reception_warden`, using nothing but their own legitimately-issued
-- AAL2 session token and a direct PostgREST PATCH to their own `staff` row,
-- set role = 'super_admin' and received 200 OK. The SAME already-issued
-- token then immediately passed a cross-hostel operation apps/api had
-- correctly denied one request earlier — proving this is a complete,
-- functional privilege escalation to the highest tier, not a cosmetic data
-- issue. `staff.auth_user_id` carries the identical exposure (no
-- self-reassignment protection either).
--
-- Fix: a BEFORE UPDATE trigger, mirroring the exact pattern
-- 0003_f01_trusted_devices_rls_remediation.sql already established in this
-- repository for the structurally identical problem on `trusted_devices`
-- (row-level RLS ownership + column-level trigger enforcement,
-- SECURITY INVOKER, exempting only the role whose own separate RLS policy
-- already grants it legitimate unrestricted access). An ALLOW-LIST, not a
-- block-list of the three columns QG-01 named: only `full_name`/`updated_at`
-- may change via self-service (the only columns an ordinary staff member has
-- any legitimate reason to touch about their own row today) —
-- id/auth_user_id/role/hostel_id/created_at are all rejected. This is
-- deliberately stricter than blocking only role/hostel_id/auth_user_id — a
-- future column added to `staff` is protected by default, not only once
-- someone remembers to update this trigger.
--
-- `super_admin` is explicitly exempted: `staff_all_super_admin`'s existing
-- RLS policy already grants that role unrestricted row-level access
-- (INSERT/UPDATE/DELETE) for legitimate staff provisioning, role changes,
-- and hostel reassignment — this is the only staff-administration path this
-- repository has ever had, it is not created or widened by this migration,
-- and this trigger does not narrow it. It only closes the self-service gap
-- for every other role.
create function public.staff_enforce_self_update_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.current_staff_role() = 'super_admin' then
    return new;
  end if;

  if new.id is distinct from old.id
    or new.auth_user_id is distinct from old.auth_user_id
    or new.role is distinct from old.role
    or new.hostel_id is distinct from old.hostel_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'staff: only full_name/updated_at may be changed by self-update'
      using errcode = '42501';
  end if;

  return new;
end;
$$;--> statement-breakpoint

create trigger staff_self_update_column_guard
  before update on public.staff
  for each row
  execute function public.staff_enforce_self_update_columns();
