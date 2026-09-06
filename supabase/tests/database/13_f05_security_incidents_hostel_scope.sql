-- PRR Finding F-05 remediation — regression + security coverage.
--
-- Prior state (the vulnerability): `security_incidents_all_hostel_admin` used
-- `isHostelAdmin` — a pure role-membership check (current_staff_role() =
-- 'hostel_admin') with NO join against the target row's owning hostel. Since
-- the policy was `for: "all"` (SELECT/INSERT/UPDATE/DELETE), ANY hostel_admin
-- from ANY hostel had full CRUD over EVERY student's security_incidents row
-- at every hostel — a cross-hostel IDOR, confirmed live against a disposable
-- local instance before this fix (hostel_admin1 (Kalinga) could read/update/
-- delete/insert against Utkal's incidents, and vice versa).
--
-- Remediation (supabase/migrations/0005_f05_security_incidents_hostel_scope.sql):
-- the policy now uses `isHostelAdminForStudent(t.studentId)` — the same
-- pre-existing SECURITY DEFINER helper (public.is_hostel_admin_for_student)
-- already used correctly on parent_student_relationships
-- (psr_all_hostel_admin, identity.ts) — which additionally requires the
-- target student's hostel_id to match the caller's own staff.hostel_id.
--
-- Every assertion below runs as a genuine `authenticated`-role session with a
-- specific staff member's auth.uid() (via request.jwt.claims), matching this
-- suite's established convention (see 05_staff_scope.sql) — never the
-- postgres/service-role connection this file itself runs under by default.

begin;
select plan(20);

-- ==========================================================================
-- Non-privileged-session guard (Phase 5): prove the assertions below do NOT
-- run under the privileged connecting role, before trusting any denial as
-- evidence of RLS actually being enforced.
-- ==========================================================================
select isnt(
  current_setting('is_superuser'), 'on',
  'guard: the outer connection is a superuser (expected — proves the SET ROLE below is a genuine privilege drop, not a no-op)'
);

set local role authenticated;
set local request.jwt.claims to '{"sub": "88888888-8888-8888-8888-888888888888"}';

select is(
  current_user, 'authenticated',
  'guard: assertions below run as the "authenticated" role, not postgres/service_role'
);
select is(
  (select auth.uid()), '88888888-8888-8888-8888-888888888888'::uuid,
  'guard: effective identity (auth.uid()) matches the intended actor (hostel_admin1), not a superuser session'
);

-- ==========================================================================
-- Baseline sanity: fixture state matches what every assertion below assumes.
-- Checked via `reset role` (bypassing RLS) since `staff` has its own RLS
-- that would otherwise hide hostel_admin2's row from hostel_admin1's session
-- -- a fact about the `staff` table, not about security_incidents.
-- ==========================================================================
reset role;
select is(
  (select hostel_id from staff where auth_user_id = '88888888-8888-8888-8888-888888888888')::text,
  'a0000000-0000-0000-0000-000000000001',
  'sanity: hostel_admin1 is scoped to Kalinga (Hostel A)'
);
select is(
  (select hostel_id from staff where auth_user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc')::text,
  'a0000000-0000-0000-0000-000000000002',
  'sanity: hostel_admin2 is scoped to Utkal (Hostel B)'
);
set local role authenticated;
set local request.jwt.claims to '{"sub": "88888888-8888-8888-8888-888888888888"}';

-- ==========================================================================
-- Positive: hostel_admin1 (Kalinga) retains full access to its OWN hostel's
-- incident — the fix must not accidentally restrict legitimate access.
-- ==========================================================================
select is(
  (select count(*) from security_incidents where id = '12000000-0000-0000-0000-000000000001')::int, 1,
  'hostel_admin1 (Kalinga): CAN read own-hostel incident1 (student1)'
);

-- ==========================================================================
-- Negative (the core F-05 fix): hostel_admin1 (Kalinga) is denied on
-- Utkal's incident2 for every CRUD operation.
-- ==========================================================================
select is(
  (select count(*) from security_incidents where id = '12000000-0000-0000-0000-000000000002')::int, 0,
  'hostel_admin1 (Kalinga): CANNOT read cross-hostel incident2 (student2/Utkal)'
);

update security_incidents set status = 'resolved' where id = '12000000-0000-0000-0000-000000000002';
reset role;
select is(
  (select status from security_incidents where id = '12000000-0000-0000-0000-000000000002')::text, 'open',
  'hostel_admin1 (Kalinga): UPDATE on cross-hostel incident2 affected zero rows (still open)'
);

set local role authenticated;
set local request.jwt.claims to '{"sub": "88888888-8888-8888-8888-888888888888"}';
delete from security_incidents where id = '12000000-0000-0000-0000-000000000002';
reset role;
select is(
  (select count(*) from security_incidents where id = '12000000-0000-0000-0000-000000000002')::int, 1,
  'hostel_admin1 (Kalinga): DELETE on cross-hostel incident2 affected zero rows (still exists)'
);

set local role authenticated;
set local request.jwt.claims to '{"sub": "88888888-8888-8888-8888-888888888888"}';
select throws_ok(
  $$ insert into security_incidents (student_id, incident_type, status)
     values ('c0000000-0000-0000-0000-000000000002', 'manual_flag', 'open') $$,
  '42501',
  null,
  'hostel_admin1 (Kalinga): INSERT for a cross-hostel student (student2/Utkal) is rejected'
);
reset role;
select is(
  (select count(*) from security_incidents)::int, 2,
  'hostel_admin1 (Kalinga): the rejected cross-hostel INSERT was not partially applied (true total, checked RLS-bypassed, still exactly 2 rows)'
);
set local role authenticated;
set local request.jwt.claims to '{"sub": "88888888-8888-8888-8888-888888888888"}';

-- ==========================================================================
-- Enumeration guard: an unfiltered aggregate must not leak the existence of
-- other hostels' rows either.
-- ==========================================================================
select is(
  (select count(*) from security_incidents)::int, 1,
  'hostel_admin1 (Kalinga): an unfiltered count() reflects only own-hostel rows (no enumeration leak)'
);

-- ==========================================================================
-- Role-switching test (Phase 5.12): within the SAME transaction, switching
-- the effective identity from hostel_admin1 to hostel_admin2 flips the
-- authorization result — proving the policy is genuinely identity-driven,
-- not a fluke of transaction/connection state.
-- ==========================================================================
set local request.jwt.claims to '{"sub": "cccccccc-cccc-cccc-cccc-cccccccccccc"}';
select is(
  (select auth.uid()), 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
  'role-switch: effective identity is now hostel_admin2'
);
select is(
  (select count(*) from security_incidents where id = '12000000-0000-0000-0000-000000000001')::int, 0,
  'role-switch: hostel_admin2 (Utkal) CANNOT read incident1 (student1/Kalinga) -- flips from hostel_admin1''s own-hostel allow'
);
select is(
  (select count(*) from security_incidents where id = '12000000-0000-0000-0000-000000000002')::int, 1,
  'role-switch: hostel_admin2 (Utkal) CAN read own-hostel incident2 (student2)'
);

-- ==========================================================================
-- super_admin authority preservation (must NOT be restricted by this fix --
-- the policy touched was `..._all_hostel_admin`, not `..._all_super_admin`).
-- ==========================================================================
set local request.jwt.claims to '{"sub": "99999999-9999-9999-9999-999999999999"}';
select is(
  (select count(*) from security_incidents)::int, 2,
  'super_admin: still sees every hostel''s incidents (authority not accidentally restricted)'
);
update security_incidents set status = 'resolved' where id = '12000000-0000-0000-0000-000000000002';
select is(
  (select status from security_incidents where id = '12000000-0000-0000-0000-000000000002')::text, 'resolved',
  'super_admin: can still write across hostels'
);

-- ==========================================================================
-- Regression: the policies this task did NOT touch keep working exactly as
-- before (own-student, linked-parent, library_incharge unscoped access).
-- ==========================================================================
set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111"}';
select is(
  (select count(*) from security_incidents where id = '12000000-0000-0000-0000-000000000001')::int, 1,
  'regression: student1 can still read their own security incident (security_incidents_select_own_student unaffected)'
);

set local request.jwt.claims to '{"sub": "33333333-3333-3333-3333-333333333333"}';
select is(
  (select count(*) from security_incidents where id = '12000000-0000-0000-0000-000000000001')::int, 1,
  'regression: student1''s linked parent (father) can still read student1''s incident (security_incidents_select_linked_parent unaffected)'
);

set local request.jwt.claims to '{"sub": "77777777-7777-7777-7777-777777777777"}';
select is(
  (select count(*) from security_incidents)::int, 2,
  'regression: library_incharge remains unscoped across hostels (security_incidents_all_reception_library unaffected by this fix)'
);

select * from finish();
rollback;
