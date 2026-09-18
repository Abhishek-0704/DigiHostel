-- Phase 4, Prompt 9 — Student Movement Management System / Hostel Return.
--
-- RLS coverage for the new `movements` table
-- (supabase/migrations/0015_movement_engine_hostel_return.sql,
-- packages/db/src/schema/movement.ts). Mirrors the exact hostel-scoping
-- shape already proven for `leave_exit_authorizations`
-- (18_exit_authorization_rls.sql) — same role split (reception/
-- hostel_admin/super_admin scoped or unscoped via
-- is_reception_for_student/is_hostel_admin_for_student/super_admin;
-- library_incharge gets no policy at all), plus this table's own
-- workflow-state invariant applied FROM THE START (the F-QG02-01 lesson,
-- not retrofitted): an INSERT is only permitted when the referenced leave
-- request is genuinely `approved` AND already has a real
-- `leave_exit_authorizations` row.

begin;
select plan(24);

-- ==========================================================================
-- Non-privileged-session guard.
-- ==========================================================================
select isnt(
  current_setting('is_superuser'), 'on',
  'guard: the outer connection is a superuser (expected — proves the SET ROLE below is a genuine privilege drop, not a no-op)'
);

-- ==========================================================================
-- Temporary two-hostel fixture (rolled back with the transaction).
-- Kalinga: one approved+exit-authorized leave (eligible), one approved-
-- but-not-exited leave, one pending leave, one rejected leave.
-- Utkal: one approved+exit-authorized leave (for cross-hostel tests).
-- ==========================================================================
reset role;
insert into leave_requests (id, student_id, reason, start_date, end_date, status) values
  ('40000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'pgTAP movements fixture (Kalinga, eligible)', '2026-11-10', '2026-11-12', 'approved'),
  ('40000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'pgTAP movements fixture (Kalinga, not exited)', '2026-11-10', '2026-11-12', 'approved'),
  ('40000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'pgTAP movements fixture (Kalinga, pending)', '2026-11-10', '2026-11-12', 'pending'),
  ('40000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', 'pgTAP movements fixture (Kalinga, rejected)', '2026-11-10', '2026-11-12', 'rejected'),
  ('40000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000002', 'pgTAP movements fixture (Utkal, eligible)', '2026-11-10', '2026-11-12', 'approved');

insert into leave_exit_authorizations (id, leave_request_id, authorized_by_staff_id, identity_confirmed) values
  ('41000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', true),
  ('41000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000006', true);

-- ==========================================================================
-- INSERT — Reception A (Kalinga), eligible (approved + exit-authorized)
-- leave, correct actor: ALLOW.
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';
select lives_ok(
  $$insert into movements (id, student_id, movement_type, leave_request_id, recorded_by_staff_id) values
    ('42000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'hostel_return', '40000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001')$$,
  'Reception A (Kalinga): CAN record a hostel return for an eligible (approved + exit-authorized) own-hostel leave'
);

-- ==========================================================================
-- UNIQUE constraint — a second return for the SAME leave request is
-- rejected at the database level.
-- ==========================================================================
select throws_ok(
  $$insert into movements (id, student_id, movement_type, leave_request_id, recorded_by_staff_id) values
    ('42000000-0000-0000-0000-000000000099', 'c0000000-0000-0000-0000-000000000001', 'hostel_return', '40000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001')$$,
  '23505',
  null,
  'UNIQUE(leave_request_id, movement_type): a second return for the same leave request is rejected (unique_violation, 23505)'
);

-- ==========================================================================
-- Workflow-state invariant — F-QG02-01's lesson applied from the start.
-- ==========================================================================
select throws_ok(
  $$insert into movements (id, student_id, movement_type, leave_request_id, recorded_by_staff_id) values
    ('42000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'hostel_return', '40000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001')$$,
  '42501',
  null,
  'Reception A (Kalinga), otherwise fully authorized: CANNOT record a return for an approved-but-never-exit-authorized leave'
);
select throws_ok(
  $$insert into movements (id, student_id, movement_type, leave_request_id, recorded_by_staff_id) values
    ('42000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'hostel_return', '40000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000001')$$,
  '42501',
  null,
  'Reception A (Kalinga): CANNOT record a return for a PENDING leave'
);
select throws_ok(
  $$insert into movements (id, student_id, movement_type, leave_request_id, recorded_by_staff_id) values
    ('42000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', 'hostel_return', '40000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001')$$,
  '42501',
  null,
  'Reception A (Kalinga): CANNOT record a return for a REJECTED leave'
);

-- ==========================================================================
-- INSERT — forged actor id: DENY.
-- ==========================================================================
select throws_ok(
  $$insert into movements (id, student_id, movement_type, leave_request_id, recorded_by_staff_id) values
    ('42000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000002', 'hostel_return', '40000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000006')$$,
  '42501',
  null,
  'Reception A (Kalinga): CANNOT record a return with a forged recorded_by_staff_id belonging to a different staff member'
);

-- ==========================================================================
-- INSERT — cross-hostel: Reception A (Kalinga) attempting to record a
-- return for the Utkal fixture: DENY.
-- ==========================================================================
select throws_ok(
  $$insert into movements (id, student_id, movement_type, leave_request_id, recorded_by_staff_id) values
    ('42000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000002', 'hostel_return', '40000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000001')$$,
  '42501',
  null,
  'Reception A (Kalinga): CANNOT record a return for the Utkal (cross-hostel) leave request'
);

-- ==========================================================================
-- INSERT — Reception B (Utkal), own-hostel eligible leave: ALLOW (reverse
-- direction, proving the scope is genuinely bidirectional).
-- ==========================================================================
set local request.jwt.claims to '{"sub": "dddddddd-dddd-dddd-dddd-dddddddddddd"}';
select lives_ok(
  $$insert into movements (id, student_id, movement_type, leave_request_id, recorded_by_staff_id) values
    ('42000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000002', 'hostel_return', '40000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000006')$$,
  'Reception B (Utkal): CAN record a hostel return for own-hostel eligible leave'
);

-- ==========================================================================
-- SELECT — Reception A (Kalinga): own-hostel allow, cross-hostel deny,
-- unfiltered count() isolation (anti-enumeration).
-- ==========================================================================
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';
select is(
  (select count(*) from movements where id = '42000000-0000-0000-0000-000000000001')::int, 1,
  'Reception A (Kalinga): CAN read own-hostel movement'
);
select is(
  (select count(*) from movements where id = '42000000-0000-0000-0000-000000000005')::int, 0,
  'Reception A (Kalinga): CANNOT read cross-hostel movement (Utkal)'
);
select is(
  (select count(*) from movements)::int, 1,
  'Reception A (Kalinga): unfiltered count() reflects only own-hostel rows (no enumeration leak)'
);

-- ==========================================================================
-- SELECT — Reception B (Utkal): reverse isolation.
-- ==========================================================================
set local request.jwt.claims to '{"sub": "dddddddd-dddd-dddd-dddd-dddddddddddd"}';
select is(
  (select count(*) from movements where id = '42000000-0000-0000-0000-000000000005')::int, 1,
  'Reception B (Utkal): CAN read own-hostel movement'
);
select is(
  (select count(*) from movements where id = '42000000-0000-0000-0000-000000000001')::int, 0,
  'Reception B (Utkal): CANNOT read cross-hostel movement (Kalinga)'
);

-- ==========================================================================
-- SELECT — hostel_admin: same isolation shape.
-- ==========================================================================
set local request.jwt.claims to '{"sub": "88888888-8888-8888-8888-888888888888"}';
select is(
  (select count(*) from movements where id = '42000000-0000-0000-0000-000000000001')::int, 1,
  'hostel_admin1 (Kalinga): CAN read own-hostel movement'
);
select is(
  (select count(*) from movements where id = '42000000-0000-0000-0000-000000000005')::int, 0,
  'hostel_admin1 (Kalinga): CANNOT read cross-hostel movement (Utkal)'
);

-- ==========================================================================
-- SELECT — library_incharge: no policy at all.
-- ==========================================================================
set local request.jwt.claims to '{"sub": "77777777-7777-7777-7777-777777777777"}';
select is(
  (select count(*) from movements)::int, 0,
  'library_incharge: CANNOT read any movement — no grant on movement-domain data anywhere in this schema'
);

-- ==========================================================================
-- SELECT — super_admin: global authority.
-- ==========================================================================
set local request.jwt.claims to '{"sub": "99999999-9999-9999-9999-999999999999"}';
select is(
  (select count(*) from movements)::int, 2,
  'super_admin: retains global authority across both hostels'
);

-- super_admin is also gated by the same workflow-state invariant.
select throws_ok(
  $$insert into movements (id, student_id, movement_type, leave_request_id, recorded_by_staff_id) values
    ('42000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000001', 'hostel_return', '40000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000004')$$,
  '42501',
  null,
  'super_admin, otherwise fully authorized: CANNOT record a return for an approved-but-never-exit-authorized leave'
);

-- ==========================================================================
-- SELECT — student (own) and linked parent: can read their own movement
-- record; unrelated parent cannot.
-- ==========================================================================
set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111"}';
select is(
  (select count(*) from movements where id = '42000000-0000-0000-0000-000000000001')::int, 1,
  'student1: CAN read their own movement record'
);
set local request.jwt.claims to '{"sub": "33333333-3333-3333-3333-333333333333"}';
select is(
  (select count(*) from movements where id = '42000000-0000-0000-0000-000000000001')::int, 1,
  'parent1 (linked father): CAN read student1''s movement record'
);
set local request.jwt.claims to '{"sub": "55555555-5555-5555-5555-555555555555"}';
select is(
  (select count(*) from movements)::int, 0,
  'unrelated parent (no relationship to any student): CANNOT read any movement record'
);

-- ==========================================================================
-- Immutability — no UPDATE or DELETE policy exists for ANY role, including
-- super_admin.
-- ==========================================================================
set local request.jwt.claims to '{"sub": "99999999-9999-9999-9999-999999999999"}';
update movements set metadata = '{"tampered": true}'::jsonb where id = '42000000-0000-0000-0000-000000000001';
select is(
  (select metadata from movements where id = '42000000-0000-0000-0000-000000000001'),
  '{}'::jsonb,
  'super_admin: UPDATE affects zero rows — no UPDATE policy exists for any role (immutable by construction)'
);
delete from movements where id = '42000000-0000-0000-0000-000000000001';
select is(
  (select count(*) from movements where id = '42000000-0000-0000-0000-000000000001')::int, 1,
  'super_admin: DELETE affects zero rows — no DELETE policy exists for any role (immutable by construction)'
);

select * from finish();
rollback;
