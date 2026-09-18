-- Phase 4, Prompt 11 — Reception Dashboard Health Operations Center.
--
-- RLS coverage for the new `health_cases`/`health_case_events` tables
-- (migration 0018). Mirrors 20_emergency_operations_center_rls.sql's exact
-- role-switching harness and isolation shape, adapted for this domain's own
-- absence of any `library_incharge` policy at all (unlike the EOC, which
-- narrowed an existing global grant, health has nothing to narrow — that
-- role has zero access to this table from the start).

begin;
select plan(26);

-- ==========================================================================
-- Non-privileged-session guard.
-- ==========================================================================
select isnt(
  current_setting('is_superuser'), 'on',
  'guard: the outer connection is a superuser (expected — proves the SET ROLE below is a genuine privilege drop, not a no-op)'
);

reset role;

-- ==========================================================================
-- INSERT — Reception A (Kalinga): own-hostel case, unassigned: ALLOW.
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';
select lives_ok(
  $$insert into health_cases (id, student_id, category, severity, status, description) values
    ('52000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'medical_observation', 'high', 'new', 'pgTAP fixture: fever, sent to infirmary')$$,
  'Reception A (Kalinga): CAN insert an own-hostel health case'
);

-- ==========================================================================
-- INSERT — Reception A, own-hostel, self-assigned: ALLOW.
-- ==========================================================================
select lives_ok(
  $$insert into health_cases (id, student_id, category, severity, status, description, assigned_staff_id) values
    ('52000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'hospital_admission', 'critical', 'acknowledged', 'pgTAP fixture: self-assigned', 'e0000000-0000-0000-0000-000000000001')$$,
  'Reception A (Kalinga): CAN insert with assigned_staff_id = own resolved staff id'
);

-- ==========================================================================
-- INSERT — Reception A, forged assigned_staff_id (a DIFFERENT staff
-- member's id): DENY.
-- ==========================================================================
select throws_ok(
  $$insert into health_cases (id, student_id, category, severity, status, description, assigned_staff_id) values
    ('52000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'emergency_admission', 'critical', 'acknowledged', 'pgTAP fixture: forged assignee', 'e0000000-0000-0000-0000-000000000006')$$,
  '42501',
  null,
  'Reception A (Kalinga): CANNOT insert with a forged assigned_staff_id belonging to a different staff member'
);

-- ==========================================================================
-- INSERT — Reception A attempting the Utkal (cross-hostel) student: DENY.
-- ==========================================================================
select throws_ok(
  $$insert into health_cases (id, student_id, category, severity, status, description) values
    ('52000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', 'medical_observation', 'medium', 'new', 'pgTAP fixture: cross-hostel attempt')$$,
  '42501',
  null,
  'Reception A (Kalinga): CANNOT insert a case for the Utkal (cross-hostel) student'
);

-- ==========================================================================
-- INSERT — Reception B (Utkal), own-hostel: ALLOW (reverse direction).
-- ==========================================================================
set local request.jwt.claims to '{"sub": "dddddddd-dddd-dddd-dddd-dddddddddddd"}';
select lives_ok(
  $$insert into health_cases (id, student_id, category, severity, status, description) values
    ('52000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000002', 'accident', 'medium', 'new', 'pgTAP fixture: Utkal own-hostel')$$,
  'Reception B (Utkal): CAN insert an own-hostel health case'
);

-- ==========================================================================
-- library_incharge: NO policy at all on this table (unlike the EOC, which
-- narrowed an existing global grant — here there is nothing to narrow).
-- ==========================================================================
set local request.jwt.claims to '{"sub": "77777777-7777-7777-7777-777777777777"}';
select throws_ok(
  $$insert into health_cases (id, student_id, category, severity, status) values
    ('52000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000001', 'medical_observation', 'low', 'new')$$,
  '42501',
  null,
  'library_incharge: CANNOT insert a health case — no product reason to manage this domain, no policy exists for this role'
);
select is(
  (select count(*) from health_cases)::int, 0,
  'library_incharge: SELECT reflects zero visible rows — no SELECT policy exists for this role'
);

-- ==========================================================================
-- SELECT — Reception A (Kalinga): own-hostel allow, cross-hostel deny,
-- unfiltered count() isolation (anti-enumeration).
-- ==========================================================================
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';
select is(
  (select count(*) from health_cases where id = '52000000-0000-0000-0000-000000000001')::int, 1,
  'Reception A (Kalinga): CAN read own-hostel health case'
);
select is(
  (select count(*) from health_cases where id = '52000000-0000-0000-0000-000000000005')::int, 0,
  'Reception A (Kalinga): CANNOT read cross-hostel health case (Utkal)'
);

-- ==========================================================================
-- SELECT — Reception B (Utkal): reverse isolation.
-- ==========================================================================
set local request.jwt.claims to '{"sub": "dddddddd-dddd-dddd-dddd-dddddddddddd"}';
select is(
  (select count(*) from health_cases where id = '52000000-0000-0000-0000-000000000005')::int, 1,
  'Reception B (Utkal): CAN read own-hostel health case'
);
select is(
  (select count(*) from health_cases where id = '52000000-0000-0000-0000-000000000001')::int, 0,
  'Reception B (Utkal): CANNOT read cross-hostel health case (Kalinga)'
);

-- ==========================================================================
-- SELECT — hostel_admin: same isolation shape.
-- ==========================================================================
set local request.jwt.claims to '{"sub": "88888888-8888-8888-8888-888888888888"}';
select is(
  (select count(*) from health_cases where id = '52000000-0000-0000-0000-000000000001')::int, 1,
  'hostel_admin1 (Kalinga): CAN read own-hostel health case'
);
select is(
  (select count(*) from health_cases where id = '52000000-0000-0000-0000-000000000005')::int, 0,
  'hostel_admin1 (Kalinga): CANNOT read cross-hostel health case (Utkal)'
);
select throws_ok(
  $$insert into health_cases (id, student_id, category, severity, status, description, assigned_staff_id) values
    ('52000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000001', 'medical_follow_up', 'low', 'acknowledged', 'pgTAP fixture', 'e0000000-0000-0000-0000-000000000006')$$,
  '42501',
  null,
  'hostel_admin1 (Kalinga): CANNOT insert with a forged assigned_staff_id belonging to a different staff member'
);

-- ==========================================================================
-- SELECT — super_admin: global authority across both hostels.
-- ==========================================================================
set local request.jwt.claims to '{"sub": "99999999-9999-9999-9999-999999999999"}';
select is(
  (select count(*) from health_cases)::int, 3,
  'super_admin: retains global authority across both hostels for the 3 successfully-inserted fixture rows above (every forged/cross-hostel/library attempt above was correctly rejected and inserted nothing)'
);

-- ==========================================================================
-- SELECT — student (own) and linked parent: can read their own case;
-- unrelated parent cannot.
-- ==========================================================================
set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111"}';
select is(
  (select count(*) from health_cases where id = '52000000-0000-0000-0000-000000000001')::int, 1,
  'student1: CAN read their own health case'
);
set local request.jwt.claims to '{"sub": "33333333-3333-3333-3333-333333333333"}';
select is(
  (select count(*) from health_cases where id = '52000000-0000-0000-0000-000000000001')::int, 1,
  'parent1 (linked father): CAN read student1''s health case'
);
set local request.jwt.claims to '{"sub": "55555555-5555-5555-5555-555555555555"}';
select is(
  (select count(*) from health_cases where id = '52000000-0000-0000-0000-000000000001')::int, 0,
  'unrelated parent (no relationship to any student): CANNOT read the health case'
);

-- ==========================================================================
-- health_case_events — RLS scoped through the parent case's student/hostel
-- relationship, same isolation shape.
-- ==========================================================================
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';
select lives_ok(
  $$insert into health_case_events (id, case_id, event_type, actor_staff_id, note) values
    ('53000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000001', 'created', 'e0000000-0000-0000-0000-000000000001', null)$$,
  'Reception A (Kalinga): CAN insert an event for its own-hostel case, actor pinned to own staff id'
);
select throws_ok(
  $$insert into health_case_events (id, case_id, event_type, actor_staff_id, note) values
    ('53000000-0000-0000-0000-000000000002', '52000000-0000-0000-0000-000000000001', 'note_added', 'e0000000-0000-0000-0000-000000000006', 'forged actor')$$,
  '42501',
  null,
  'Reception A (Kalinga): CANNOT insert an event with a forged actor_staff_id belonging to a different staff member'
);
select throws_ok(
  $$insert into health_case_events (id, case_id, event_type, actor_staff_id, note) values
    ('53000000-0000-0000-0000-000000000003', '52000000-0000-0000-0000-000000000005', 'note_added', 'e0000000-0000-0000-0000-000000000001', 'cross-hostel attempt')$$,
  '42501',
  null,
  'Reception A (Kalinga): CANNOT insert an event for the Utkal (cross-hostel) case'
);
select is(
  (select count(*) from health_case_events where case_id = '52000000-0000-0000-0000-000000000001')::int, 1,
  'Reception A (Kalinga): CAN read the event timeline for its own-hostel case'
);
set local request.jwt.claims to '{"sub": "dddddddd-dddd-dddd-dddd-dddddddddddd"}';
select is(
  (select count(*) from health_case_events where case_id = '52000000-0000-0000-0000-000000000001')::int, 0,
  'Reception B (Utkal): CANNOT read the event timeline for the Kalinga case'
);

-- ==========================================================================
-- Immutability — health_case_events has no UPDATE or DELETE policy for any
-- role, including super_admin.
-- ==========================================================================
set local request.jwt.claims to '{"sub": "99999999-9999-9999-9999-999999999999"}';
update health_case_events set note = 'tampered' where id = '53000000-0000-0000-0000-000000000001';
select is(
  (select note from health_case_events where id = '53000000-0000-0000-0000-000000000001'),
  null,
  'super_admin: UPDATE on health_case_events affects zero rows — no UPDATE policy exists for any role'
);
delete from health_case_events where id = '53000000-0000-0000-0000-000000000001';
select is(
  (select count(*) from health_case_events where id = '53000000-0000-0000-0000-000000000001')::int, 1,
  'super_admin: DELETE on health_case_events affects zero rows — no DELETE policy exists for any role'
);

select * from finish();
rollback;
