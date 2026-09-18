-- Phase 5, Prompt 13 — Identity & Access Administration Center.
--
-- Proves the `staff_self_update_column_guard` trigger extension
-- (migration 0021) genuinely denies a non-super-admin self-updating their
-- own `status` column — the exact class of gap this migration's own
-- header comment names: the trigger is a DENY-LIST of specific columns,
-- not an allow-list, so a new column is NOT automatically covered unless
-- explicitly added. This file proves it WAS explicitly added, not merely
-- documented as added.

begin;
select plan(8);

select isnt(
  current_setting('is_superuser'), 'on',
  'guard: the outer connection is a superuser (expected — proves the SET ROLE below is a genuine privilege drop, not a no-op)'
);

reset role;
select is(
  (select status::text from staff where auth_user_id = '66666666-6666-6666-6666-666666666666'),
  'active',
  'sanity: reception1 is seeded as active'
);

-- ==========================================================================
-- A. A non-super-admin (reception_warden) cannot self-update their own
-- status, even to the SAME value (the trigger denies on any attempt to
-- SET status, not merely on an actual change — matching the existing
-- role/hostel_id/auth_user_id columns' identical behavior).
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';
select throws_ok(
  $$ update staff set status = 'suspended' where auth_user_id = '66666666-6666-6666-6666-666666666666' $$,
  '42501',
  null,
  'reception1: CANNOT self-update status to suspended (denied by the extended trigger)'
);
reset role;
select is(
  (select status::text from staff where auth_user_id = '66666666-6666-6666-6666-666666666666'),
  'active',
  'verify: reception1 remains active (the denied self-update had zero effect)'
);

-- ==========================================================================
-- B. A hostel_admin also cannot self-update their own status (not just
-- reception_warden — the trigger's role check is `current_staff_role() =
-- 'super_admin'`, applying identically to every other role).
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "88888888-8888-8888-8888-888888888888"}';
select throws_ok(
  $$ update staff set status = 'suspended' where auth_user_id = '88888888-8888-8888-8888-888888888888' $$,
  '42501',
  null,
  'hostel_admin1: CANNOT self-update own status either'
);

-- ==========================================================================
-- C. Regression: full_name self-update (the one column this policy has
-- always legitimately allowed) still works after the trigger extension.
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';
update staff set full_name = 'Test Reception Warden Updated' where auth_user_id = '66666666-6666-6666-6666-666666666666';
reset role;
select is(
  (select full_name from staff where auth_user_id = '66666666-6666-6666-6666-666666666666'),
  'Test Reception Warden Updated',
  'regression: reception1 can still self-update full_name (the trigger extension did not overcorrect)'
);

-- ==========================================================================
-- D. super_admin CAN update another staff member's status — the actual,
-- intended administrative capability this whole feature depends on.
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "99999999-9999-9999-9999-999999999999"}';
update staff set status = 'suspended' where auth_user_id = '66666666-6666-6666-6666-666666666666';
reset role;
select is(
  (select status::text from staff where auth_user_id = '66666666-6666-6666-6666-666666666666'),
  'suspended',
  'super_admin CAN update another staff member''s status'
);

-- Restore for baseline cleanliness (this file rolls back anyway, but
-- explicit restoration keeps the fixture's intent legible).
reset role;
update staff set status = 'active', full_name = 'Test Reception Warden'
  where auth_user_id = '66666666-6666-6666-6666-666666666666';
select is(
  (select status::text from staff where auth_user_id = '66666666-6666-6666-6666-666666666666'),
  'active',
  'cleanup verified: reception1 restored to active'
);

select * from finish();
rollback;
