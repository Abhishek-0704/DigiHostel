-- PRR Phase 13, Finding F-01 remediation.
--
-- Root cause: `trusted_devices_insert_own` let any authenticated parent
-- self-insert a fully active trusted-device row (WITH CHECK only compared
-- parent_id to the caller's own id — no attestation, no backend mediation,
-- despite docs/rls-policy-matrix.md always documenting device creation as
-- "post-attestation, via Fastify-mediated flow, not a raw client insert").
-- Device registration is not implemented anywhere in this codebase today
-- (registerCurrentDevice() still throws DeviceServiceNotImplementedError),
-- so there is no legitimate authenticated-client INSERT path to preserve.
-- The DROP below removes it entirely; RLS is default-deny, so `authenticated`
-- now has zero INSERT policies on this table (matching the pattern already
-- established for device_attestation_events).
DROP POLICY "trusted_devices_insert_own" ON "trusted_devices" CASCADE;--> statement-breakpoint

-- Self-revocation is the only authenticated-client mutation left on this
-- table. The ALTER below closes a second, related gap: the previous
-- trusted_devices_revoke_own policy's USING/WITH CHECK only compared
-- parent_id, with no constraint on revoked_at's value or direction — so a
-- parent could UPDATE an already-revoked device of their own back to
-- revoked_at = NULL (self-reactivation), or touch any other row while
-- already at revoked_at IS NULL. The new clauses make this a one-way
-- transition: USING requires the row to currently be active (revoked_at IS
-- NULL — an already-revoked row is a dead end, nothing further to do to
-- it); WITH CHECK requires the resulting row to be revoked. Reactivation
-- via UPDATE is now impossible for this role.
ALTER POLICY "trusted_devices_revoke_own" ON "trusted_devices" TO authenticated USING ("trusted_devices"."parent_id" = public.current_parent_id() and "trusted_devices"."revoked_at" is null) WITH CHECK ("trusted_devices"."parent_id" = public.current_parent_id() and "trusted_devices"."revoked_at" is not null);--> statement-breakpoint

-- Column-level defense-in-depth for the one remaining authenticated-client
-- mutation (self-revocation). RLS USING/WITH CHECK clauses above constrain
-- which rows can be touched and what the resulting revoked_at must be, but
-- cannot by themselves stop a caller from smuggling a change to an
-- unrelated column (device_fingerprint, platform, parent_id,
-- expo_push_token, registered_at) into the same UPDATE statement. Drizzle's
-- schema DSL (this version) has no trigger primitive, so — matching the
-- established precedent of hand-appending raw SQL this schema can't express
-- (see the CREATE FUNCTION prelude in 0000_cute_korvac.sql) — this is added
-- directly to the generated migration rather than as a separate hand-written
-- file. SECURITY INVOKER (not DEFINER): this function only compares OLD/NEW
-- values already visible to the triggering statement and calls the
-- already-SECURITY-DEFINER current_staff_role() helper — it needs no
-- elevated privilege of its own. super_admin is explicitly exempted: that
-- role's existing, separately-scoped incident-response access
-- (trusted_devices_all_super_admin) is unaffected by this F-01 remediation
-- and is out of this migration's scope.
create function public.trusted_devices_enforce_revoke_only()
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
    or new.parent_id is distinct from old.parent_id
    or new.platform is distinct from old.platform
    or new.device_fingerprint is distinct from old.device_fingerprint
    or new.expo_push_token is distinct from old.expo_push_token
    or new.registered_at is distinct from old.registered_at
  then
    raise exception 'trusted_devices: only revoked_at/revoked_reason may be changed by self-revocation'
      using errcode = '42501';
  end if;

  return new;
end;
$$;--> statement-breakpoint

create trigger trusted_devices_revoke_only
  before update on public.trusted_devices
  for each row
  execute function public.trusted_devices_enforce_revoke_only();