-- QG-04 Remediation, Finding F-QG04-02.
--
-- Proves the `staff_self_update_column_guard` trigger extension (migration
-- 0023) genuinely denies a non-super-admin self-updating their own
-- `sessions_invalidated_before` column — the exact scenario this
-- remediation's own security requirement names: without this extension, a
-- staff member could self-clear (set back to NULL) their own invalidation
-- timestamp immediately after being force-signed-out, silently reviving
-- their own already-revoked session on its very next request. This file
-- proves the column WAS explicitly added to the trigger's deny-list, not
-- merely documented as added — the same "a new column is not automatically
-- covered by an existing deny-list guard" lesson QG-01 and Prompt 13's own
-- `status` column already taught this project twice
-- (25_prompt13_staff_status_self_update_guard.sql mirrors this file's
-- exact structure for that earlier column).

begin;
select plan(7);

select isnt(
  current_setting('is_superuser'), 'on',
  'guard: the outer connection is a superuser (expected — proves the SET ROLE below is a genuine privilege drop, not a no-op)'
);

reset role;
select is(
  (select sessions_invalidated_before from staff where auth_user_id = '66666666-6666-6666-6666-666666666666'),
  null,
  'sanity: reception1 is seeded with no invalidation timestamp'
);

-- ==========================================================================
-- A. A non-super-admin (reception_warden) cannot self-clear (or set) their
-- own sessions_invalidated_before column at all — attempting to smuggle a
-- NULL-to-value (or value-to-NULL) change into a self-update must be
-- denied by the extended trigger, exactly like role/hostel_id/status.
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';
select throws_ok(
  $$ update staff set sessions_invalidated_before = now() where auth_user_id = '66666666-6666-6666-6666-666666666666' $$,
  '42501',
  null,
  'reception1: CANNOT self-set sessions_invalidated_before (denied by the extended trigger)'
);
reset role;
select is(
  (select sessions_invalidated_before from staff where auth_user_id = '66666666-6666-6666-6666-666666666666'),
  null,
  'verify: reception1''s invalidation timestamp remains NULL (the denied self-update had zero effect)'
);

-- ==========================================================================
-- B. The attack this remediation specifically defends against: a staff
-- member whose sessions WERE genuinely invalidated by a super_admin cannot
-- self-clear it back to NULL to revive their own already-revoked session.
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "99999999-9999-9999-9999-999999999999"}';
update staff set sessions_invalidated_before = now() where auth_user_id = '66666666-6666-6666-6666-666666666666';
reset role;
select isnt(
  (select sessions_invalidated_before from staff where auth_user_id = '66666666-6666-6666-6666-666666666666'),
  null,
  'sanity: super_admin genuinely set the invalidation timestamp'
);

set local role authenticated;
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';
select throws_ok(
  $$ update staff set sessions_invalidated_before = null where auth_user_id = '66666666-6666-6666-6666-666666666666' $$,
  '42501',
  null,
  'reception1: CANNOT self-clear an existing invalidation timestamp back to NULL (the exact self-revival attack)'
);
reset role;
select isnt(
  (select sessions_invalidated_before from staff where auth_user_id = '66666666-6666-6666-6666-666666666666'),
  null,
  'verify: the invalidation timestamp survives the denied self-clear attempt'
);

-- Restore for baseline cleanliness (this file rolls back anyway). Must
-- explicitly re-establish a super_admin `request.jwt.claims` context here,
-- not merely `reset role`: `SET LOCAL role` and `SET LOCAL
-- request.jwt.claims` are independent GUCs — `reset role` alone leaves the
-- PRIOR block's reception1 claims GUC still in effect, which would make
-- `auth.uid()` (and therefore `current_staff_role()`) still resolve to
-- reception1 here, causing the trigger to deny even this superuser-role
-- cleanup statement.
set local role authenticated;
set local request.jwt.claims to '{"sub": "99999999-9999-9999-9999-999999999999"}';
update staff set sessions_invalidated_before = null
  where auth_user_id = '66666666-6666-6666-6666-666666666666';
reset role;

select * from finish();
rollback;
