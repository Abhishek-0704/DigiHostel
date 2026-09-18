-- QG-01 (Authentication & Security Review), Finding F-QG01-01 remediation —
-- regression + security coverage.
--
-- Prior state (the vulnerability): `staff_update_own_limited`'s USING/WITH
-- CHECK only compared `auth_user_id` to `auth.uid()` — it constrained WHICH
-- ROW a staff member could touch, never WHICH COLUMNS. Combined with
-- `authenticated` holding a blanket table-level UPDATE grant on every
-- column, a real `reception_warden`, using their own legitimately-issued
-- AAL2 session, self-PATCHed `role` to `super_admin` via direct PostgREST —
-- confirmed live during the QG-01 review, along with proof the same
-- already-issued token then passed a previously-denied cross-hostel
-- operation. `hostel_id` and `auth_user_id` carried the identical exposure.
--
-- Remediation (supabase/migrations/0009_qg01_staff_privilege_column_protection.sql):
-- a BEFORE UPDATE trigger (`staff_self_update_column_guard`) rejects any
-- self-update that changes id/auth_user_id/role/hostel_id/created_at —
-- an allow-list (only full_name/updated_at may change), not a block-list of
-- just the three named columns. `super_admin`'s existing, separate
-- `staff_all_super_admin` policy is unaffected — that remains the only
-- staff-administration path this repository has ever had.
--
-- This file proves every escalation vector QG-01 identified fails closed,
-- and that the legitimate self-service and admin paths still work — mirrors
-- 12_f01_trusted_device_rls.sql's own structure and rigor exactly.

begin;
select plan(16);

-- ==========================================================================
-- Sanity: fixture state matches what every assertion below assumes.
-- ==========================================================================
select is(
  (select role::text from staff where id = 'e0000000-0000-0000-0000-000000000001'), 'reception_warden',
  'sanity: reception1 starts as reception_warden'
);
select is(
  (select hostel_id::text from staff where id = 'e0000000-0000-0000-0000-000000000001'),
  'a0000000-0000-0000-0000-000000000001',
  'sanity: reception1 starts scoped to Kalinga'
);

-- ==========================================================================
-- Attack A (Test 1) — the exact QG-01 exploit: reception1 self-promotes to
-- super_admin. Expected: DENIED.
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}'; -- reception1

select throws_ok(
  $$ update staff set role = 'super_admin' where id = 'e0000000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'Attack A (the QG-01 exploit): reception_warden cannot self-promote to super_admin'
);

reset role;
select is(
  (select role::text from staff where id = 'e0000000-0000-0000-0000-000000000001'), 'reception_warden',
  'Attack A: reception1''s role is unchanged after the rejected self-promotion'
);

-- ==========================================================================
-- Attack B (Test 2) — hostel-scope self-escalation: reception1 reassigns
-- their own hostel_id to Utkal. Expected: DENIED.
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';

select throws_ok(
  $$ update staff set hostel_id = 'a0000000-0000-0000-0000-000000000002' where id = 'e0000000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'Attack B: reception_warden cannot self-reassign hostel_id to another hostel'
);

reset role;
select is(
  (select hostel_id::text from staff where id = 'e0000000-0000-0000-0000-000000000001'),
  'a0000000-0000-0000-0000-000000000001',
  'Attack B: reception1''s hostel_id is unchanged after the rejected reassignment'
);

-- ==========================================================================
-- Attack C (Test 3) — identity-linkage takeover: reception1 attempts to
-- rebind their staff row to a different auth_user_id. Expected: DENIED.
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';

select throws_ok(
  $$ update staff set auth_user_id = '77777777-7777-7777-7777-777777777777' where id = 'e0000000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'Attack C: reception_warden cannot rebind their own row to a different auth_user_id'
);

reset role;
select is(
  (select auth_user_id::text from staff where id = 'e0000000-0000-0000-0000-000000000001'),
  '66666666-6666-6666-6666-666666666666',
  'Attack C: reception1''s auth_user_id linkage is unchanged after the rejected takeover attempt'
);

-- ==========================================================================
-- Attack D (Test 4) — cross-staff privilege modification: reception1
-- attempts to modify a DIFFERENT staff member's row (hostel_admin1).
-- Expected: DENIED at the row level (RLS's own ownership check silently
-- filters it to zero affected rows — the trigger never even needs to fire).
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}'; -- reception1
update staff set role = 'super_admin' where id = 'e0000000-0000-0000-0000-000000000003'; -- hostel_admin1's row
reset role;

select is(
  (select role::text from staff where id = 'e0000000-0000-0000-0000-000000000003'), 'hostel_admin',
  'Attack D: reception1 cannot modify another staff member''s row at all — hostel_admin1''s role is untouched'
);

-- ==========================================================================
-- Attack E (Test — smuggling) — a legitimate-looking self-update (full_name)
-- with a privilege-column change riding along in the same statement.
-- Expected: DENIED, all-or-nothing (mirrors F-01's own Attack E).
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';

select throws_ok(
  $$ update staff set full_name = 'Smuggled Name Change', role = 'hostel_admin' where id = 'e0000000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'Attack E: reception1 cannot smuggle a role change into an otherwise-legitimate full_name update'
);

reset role;
select is(
  (select full_name from staff where id = 'e0000000-0000-0000-0000-000000000001'), 'Test Reception Warden',
  'Attack E: reception1''s full_name is unchanged — the rejected statement changed nothing at all'
);

-- ==========================================================================
-- Legitimate path (Test 5) — super_admin's existing, unaffected
-- administration path: promoting another staff member's role and hostel
-- scope. Expected: ALLOWED (the only staff-administration path this
-- repository has ever had, unchanged by this remediation).
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "99999999-9999-9999-9999-999999999999"}'; -- super_admin
update staff set role = 'hostel_admin', hostel_id = 'a0000000-0000-0000-0000-000000000002'
  where id = 'e0000000-0000-0000-0000-000000000001'; -- reception1's row
reset role;

select is(
  (select role::text from staff where id = 'e0000000-0000-0000-0000-000000000001'), 'hostel_admin',
  'Legitimate path: super_admin CAN change another staff member''s role — administration is not broken'
);
select is(
  (select hostel_id::text from staff where id = 'e0000000-0000-0000-0000-000000000001'),
  'a0000000-0000-0000-0000-000000000002',
  'Legitimate path: super_admin CAN change another staff member''s hostel_id in the same statement'
);

-- ==========================================================================
-- Legitimate path (Test 6) — ordinary self-profile update: reception1
-- changes only their own full_name. Expected: ALLOWED (note: at this point
-- in the transaction reception1 has been promoted to hostel_admin by the
-- super_admin step above, but the trigger's own allow-list applies
-- identically regardless of role — this proves the trigger doesn't merely
-- special-case reception_warden).
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';
update staff set full_name = 'Test Reception Warden (Updated)' where id = 'e0000000-0000-0000-0000-000000000001';
reset role;

select is(
  (select full_name from staff where id = 'e0000000-0000-0000-0000-000000000001'), 'Test Reception Warden (Updated)',
  'Legitimate path: self-service full_name update still works — the fix is not overly broad'
);

-- ==========================================================================
-- No regression (Test 7) — staff_select_own remains exactly as scoped as
-- before this migration (this migration adds an UPDATE trigger only; it
-- must not affect SELECT visibility at all).
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}'; -- reception1
select is(
  (select count(*) from staff)::int, 1,
  'No regression: reception1''s own-scoped SELECT on staff still returns exactly one row (their own)'
);
select is(
  (select count(*) from staff where id != 'e0000000-0000-0000-0000-000000000001')::int, 0,
  'No regression: reception1 still cannot see any other staff member''s row'
);
reset role;

select * from finish();
rollback;
