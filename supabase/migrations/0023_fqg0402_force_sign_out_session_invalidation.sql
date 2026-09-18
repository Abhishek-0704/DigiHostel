-- QG-04 Remediation, Finding F-QG04-02 (CRITICAL) — "Force Sign-Out" was
-- completely non-functional for every staff member, silently, since Prompt
-- 13. Root cause, independently confirmed against the installed
-- @supabase/auth-js@2.113.0's own .d.ts and implementation: Supabase Auth
-- Admin API's `signOut(jwt, scope)` requires a SESSION ACCESS-TOKEN JWT as
-- its first argument (it POSTs that value as a Bearer header to
-- `${url}/logout`) — not a user id. `staffIdentityAdmin.ts` was passing
-- `authUserId` (a UUID), which always failed with
-- `AuthApiError: invalid JWT ... token contains an invalid number of
-- segments`, live-reproduced twice during the QG-04 review.
--
-- Exhaustive inspection of the installed Admin API's full method surface
-- (signOut, inviteUserByEmail, generateLink, createUser, listUsers,
-- getUserById, updateUserById, deleteUser) confirmed NO user-id-keyed
-- "revoke every session for this user" capability exists anywhere in this
-- SDK version. `updateUserById`'s `ban_duration` was evaluated and
-- rejected too: a ban only prevents FUTURE Supabase Auth sign-ins — it does
-- not invalidate an already-issued, unexpired JWT, and this backend's own
-- JWT verification (apps/api/src/lib/auth/jwt.ts) is entirely stateless
-- (JWKS signature check only, never a round-trip to GoTrue's live user
-- state), so a ban would not achieve the required product semantic either.
--
-- Fix: a genuine, backend-owned session-invalidation mechanism —
-- `staff.sessions_invalidated_before` (nullable timestamptz). Force
-- Sign-Out now sets this to `now()` for the target staff row, in the SAME
-- transaction as its audit-log write (matching every other DB-only
-- mutation's established transactional-inline convention — see
-- `apps/api/src/domain/staff/repository.ts`'s updated `forceSignOut()`).
-- `findStaffByAuthUserId` (apps/api/src/lib/auth/db-port.ts) now compares
-- this column against the PRESENTED JWT'S OWN `iat` claim on every
-- authenticated request — a token issued before the invalidation timestamp
-- is rejected (401 no_app_profile), exactly the same per-request,
-- fail-closed resolution point `status = 'active'` already established for
-- suspension, extended rather than duplicated. NULL (the default) means "no
-- invalidation has ever been triggered."
--
-- CRITICAL (same lesson QG-01/F-QG03-09/Prompt-13's own `status` column
-- already taught this project twice): `staff_enforce_self_update_columns()`
-- is a DENY-LIST of specific named columns, not an allow-list — a new
-- column is NOT automatically protected. Without this extension, a staff
-- member could self-clear their own `sessions_invalidated_before` via the
-- `staff_update_own_limited` RLS policy (which only restricts WHICH ROW,
-- never WHICH COLUMNS) immediately after being force-signed-out, silently
-- reviving their own already-invalidated session on its next request. This
-- migration explicitly extends the deny-list to also reject
-- `new.sessions_invalidated_before is distinct from old.sessions_invalidated_before`
-- for any non-super-admin, non-service-role caller.

ALTER TABLE "staff" ADD COLUMN "sessions_invalidated_before" timestamptz;--> statement-breakpoint

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
    or new.sessions_invalidated_before is distinct from old.sessions_invalidated_before
    or new.created_at is distinct from old.created_at
  then
    raise exception 'staff: only full_name/updated_at may be changed by self-update'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
