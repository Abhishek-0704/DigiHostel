-- PRR Finding F-05A remediation — regression + security coverage.
-- (Identified during the F-05 audit; NOT a reopening of F-05's own
-- hostel_admin fix, which this file also regression-checks but does not
-- touch.)
--
-- Prior state (the vulnerability): `security_incidents_all_reception_library`
-- combined reception_warden and library_incharge under one policy using
-- `current_staff_role() = 'reception_warden' or current_staff_role() =
-- 'library_incharge'` — a pure role-membership OR with NO hostel-scope join
-- for reception. Since the policy was `for: "all"`, any authenticated
-- reception_warden, from any hostel, had full SELECT/INSERT/UPDATE/DELETE
-- access (including reassigning an incident's student_id into another
-- hostel) to every OTHER hostel's security_incidents rows too. Confirmed
-- live, pre-fix, with genuine non-privileged actor sessions.
--
-- Remediation (supabase/migrations/0006_f05a_security_incidents_reception_scope.sql):
-- split into `security_incidents_all_reception` (now using
-- `is_reception_for_student(student_id)`, the same SECURITY DEFINER
-- join-through-students pattern F-05 established for hostel_admin) and
-- `security_incidents_all_library` (unchanged global access, `for: "all"`
-- still, only the role check). This mirrors the pre-existing precedent for
-- these same two roles on the `students` table
-- (students_select_own_hostel_reception / students_select_library_incharge).

begin;
select plan(26);

-- ==========================================================================
-- Non-privileged-session guard (same discipline as F-05, 13_f05_...): prove
-- the assertions below do NOT run under the privileged connecting role.
-- ==========================================================================
select isnt(
  current_setting('is_superuser'), 'on',
  'guard: the outer connection is a superuser (expected — proves the SET ROLE below is a genuine privilege drop, not a no-op)'
);

set local role authenticated;
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';

select is(
  current_user, 'authenticated',
  'guard: assertions below run as the "authenticated" role, not postgres/service_role'
);
select is(
  (select auth.uid()), '66666666-6666-6666-6666-666666666666'::uuid,
  'guard: effective identity (auth.uid()) matches the intended actor (Reception A), not a superuser session'
);

-- ==========================================================================
-- Baseline sanity (checked via `reset role`, bypassing `staff`'s own RLS,
-- which would otherwise hide Reception B's row from Reception A's session).
-- ==========================================================================
reset role;
select is(
  (select hostel_id from staff where auth_user_id = '66666666-6666-6666-6666-666666666666')::text,
  'a0000000-0000-0000-0000-000000000001',
  'sanity: Reception A (reception1) is scoped to Kalinga (Hostel A)'
);
select is(
  (select hostel_id from staff where auth_user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd')::text,
  'a0000000-0000-0000-0000-000000000002',
  'sanity: Reception B (reception2) is scoped to Utkal (Hostel B)'
);
set local role authenticated;
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';

-- ==========================================================================
-- Positive: Reception A retains full access to its OWN hostel's incident.
-- ==========================================================================
select is(
  (select count(*) from security_incidents where id = '12000000-0000-0000-0000-000000000001')::int, 1,
  'Reception A (Kalinga): CAN read own-hostel incident1 (student1)'
);

-- ==========================================================================
-- Negative (the core F-05A fix): Reception A is denied on Utkal's incident2
-- for every CRUD operation, including a known-ID lookup and reassignment.
-- ==========================================================================
select is(
  (select count(*) from security_incidents where id = '12000000-0000-0000-0000-000000000002')::int, 0,
  'Reception A (Kalinga): CANNOT read cross-hostel incident2 by known UUID (student2/Utkal)'
);
select is(
  (select count(*) from security_incidents)::int, 1,
  'Reception A (Kalinga): unfiltered count() reflects only own-hostel rows (no enumeration leak)'
);

update security_incidents set status = 'escalated' where id = '12000000-0000-0000-0000-000000000002';
reset role;
select is(
  (select status from security_incidents where id = '12000000-0000-0000-0000-000000000002')::text, 'open',
  'Reception A (Kalinga): UPDATE on cross-hostel incident2 affected zero rows (still open)'
);

set local role authenticated;
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';
select throws_ok(
  $$ update security_incidents set student_id = 'c0000000-0000-0000-0000-000000000002'
     where id = '12000000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'Reception A (Kalinga): reassigning own-hostel incident1 into Utkal (student2) is rejected by WITH CHECK'
);
reset role;
select is(
  (select student_id from security_incidents where id = '12000000-0000-0000-0000-000000000001')::text,
  'c0000000-0000-0000-0000-000000000001',
  'Reception A (Kalinga): the rejected cross-hostel reassignment left incident1 unchanged'
);

set local role authenticated;
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';
delete from security_incidents where id = '12000000-0000-0000-0000-000000000002';
reset role;
select is(
  (select count(*) from security_incidents where id = '12000000-0000-0000-0000-000000000002')::int, 1,
  'Reception A (Kalinga): DELETE on cross-hostel incident2 affected zero rows (still exists)'
);

set local role authenticated;
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';
select throws_ok(
  $$ insert into security_incidents (student_id, incident_type, status)
     values ('c0000000-0000-0000-0000-000000000002', 'manual_flag', 'open') $$,
  '42501',
  null,
  'Reception A (Kalinga): INSERT for a cross-hostel student (student2/Utkal) is rejected'
);
reset role;
select is(
  (select count(*) from security_incidents)::int, 2,
  'Reception A (Kalinga): the rejected cross-hostel INSERT was not partially applied (true total, checked RLS-bypassed, still exactly 2 rows)'
);

-- ==========================================================================
-- Positive: same-hostel write operations (UPDATE/DELETE/INSERT) remain
-- available to Reception A -- the fix must not accidentally restrict
-- legitimate own-hostel access to a mere SELECT.
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';
insert into security_incidents (id, student_id, incident_type, status)
  values ('12000000-0000-0000-0000-000000000099', 'c0000000-0000-0000-0000-000000000001', 'manual_flag', 'open');
select is(
  (select count(*) from security_incidents where id = '12000000-0000-0000-0000-000000000099')::int, 1,
  'Reception A (Kalinga): same-hostel INSERT (student1) is allowed'
);
update security_incidents set status = 'escalated' where id = '12000000-0000-0000-0000-000000000099';
select is(
  (select status from security_incidents where id = '12000000-0000-0000-0000-000000000099')::text, 'escalated',
  'Reception A (Kalinga): same-hostel UPDATE (student1) is allowed'
);
delete from security_incidents where id = '12000000-0000-0000-0000-000000000099';
reset role;
select is(
  (select count(*) from security_incidents where id = '12000000-0000-0000-0000-000000000099')::int, 0,
  'Reception A (Kalinga): same-hostel DELETE (student1) is allowed, and the test fixture (incident1/incident2) is otherwise untouched'
);

-- ==========================================================================
-- Role-switching test: within the SAME transaction, switching the effective
-- identity from Reception A to Reception B flips the authorization result.
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "dddddddd-dddd-dddd-dddd-dddddddddddd"}';
select is(
  current_user, 'authenticated',
  'role-switch: still running as "authenticated" after the switch, not a privileged role'
);
select is(
  (select auth.uid()), 'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid,
  'role-switch: effective identity is now Reception B'
);
select is(
  (select count(*) from security_incidents where id = '12000000-0000-0000-0000-000000000001')::int, 0,
  'role-switch: Reception B (Utkal) CANNOT read incident1 (student1/Kalinga) -- flips from Reception A''s own-hostel allow'
);
select is(
  (select count(*) from security_incidents where id = '12000000-0000-0000-0000-000000000002')::int, 1,
  'role-switch: Reception B (Utkal) CAN read own-hostel incident2 (student2)'
);

-- ==========================================================================
-- Library regression: global access must remain completely unaffected by
-- this fix (library_incharge's policy was split out unchanged).
-- ==========================================================================
set local request.jwt.claims to '{"sub": "77777777-7777-7777-7777-777777777777"}';
select is(
  (select count(*) from security_incidents)::int, 2,
  'library_incharge: retains global access across both hostels (security_incidents_all_library unaffected)'
);

-- ==========================================================================
-- super_admin regression: global authority must remain unaffected.
-- ==========================================================================
set local request.jwt.claims to '{"sub": "99999999-9999-9999-9999-999999999999"}';
select is(
  (select count(*) from security_incidents)::int, 2,
  'super_admin: retains global authority across both hostels'
);

-- ==========================================================================
-- F-05 regression: the accepted hostel_admin fix must remain intact --
-- this task does not reopen or modify it.
-- ==========================================================================
set local request.jwt.claims to '{"sub": "88888888-8888-8888-8888-888888888888"}';
select is(
  (select count(*) from security_incidents)::int, 1,
  'F-05 regression: hostel_admin1 (Kalinga) still sees only its own hostel''s incident'
);
set local request.jwt.claims to '{"sub": "cccccccc-cccc-cccc-cccc-cccccccccccc"}';
select is(
  (select count(*) from security_incidents)::int, 1,
  'F-05 regression: hostel_admin2 (Utkal) still sees only its own hostel''s incident'
);

-- ==========================================================================
-- Other-role regression: policies this task did not touch keep working.
-- ==========================================================================
set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111"}';
select is(
  (select count(*) from security_incidents where id = '12000000-0000-0000-0000-000000000001')::int, 1,
  'regression: student1 can still read their own security incident (security_incidents_select_own_student unaffected)'
);

select * from finish();
rollback;
