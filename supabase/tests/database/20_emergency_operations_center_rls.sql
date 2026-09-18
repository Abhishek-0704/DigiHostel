-- Phase 4, Prompt 10 — Reception Dashboard Emergency Operations Center.
--
-- RLS coverage for the EOC's additions to `security_incidents`
-- (migrations 0016/0017) and the new `security_incident_events` table.
-- Mirrors 19_movements_rls.sql's/18_exit_authorization_rls.sql's exact
-- role-switching harness and isolation shape. Does NOT re-test 13/14's
-- already-certified hostel-scope behavior for the ORIGINAL two incident
-- types (missed_checkpoint/manual_flag) — this file covers what's new:
-- the 8 emergency categories, the assigned_staff_id forged-actor defense,
-- library_incharge's narrowed access, and the new events table.

begin;
select plan(28);

-- ==========================================================================
-- Non-privileged-session guard.
-- ==========================================================================
select isnt(
  current_setting('is_superuser'), 'on',
  'guard: the outer connection is a superuser (expected — proves the SET ROLE below is a genuine privilege drop, not a no-op)'
);

reset role;

-- ==========================================================================
-- INSERT — Reception A (Kalinga): own-hostel emergency-category incident,
-- unassigned: ALLOW.
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';
select lives_ok(
  $$insert into security_incidents (id, student_id, incident_type, status, severity, description) values
    ('50000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'medical', 'open', 'critical', 'pgTAP fixture: collapsed in common room')$$,
  'Reception A (Kalinga): CAN insert an own-hostel emergency-category incident'
);

-- ==========================================================================
-- INSERT — Reception A, own-hostel, self-assigned: ALLOW.
-- ==========================================================================
select lives_ok(
  $$insert into security_incidents (id, student_id, incident_type, status, severity, description, assigned_staff_id) values
    ('50000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'fire', 'acknowledged', 'high', 'pgTAP fixture: self-assigned', 'e0000000-0000-0000-0000-000000000001')$$,
  'Reception A (Kalinga): CAN insert with assigned_staff_id = own resolved staff id'
);

-- ==========================================================================
-- INSERT — Reception A, forged assigned_staff_id (a DIFFERENT staff
-- member's id): DENY.
-- ==========================================================================
select throws_ok(
  $$insert into security_incidents (id, student_id, incident_type, status, severity, description, assigned_staff_id) values
    ('50000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'violence', 'acknowledged', 'high', 'pgTAP fixture: forged assignee', 'e0000000-0000-0000-0000-000000000006')$$,
  '42501',
  null,
  'Reception A (Kalinga): CANNOT insert with a forged assigned_staff_id belonging to a different staff member'
);

-- ==========================================================================
-- INSERT — Reception A attempting the Utkal (cross-hostel) student: DENY.
-- ==========================================================================
select throws_ok(
  $$insert into security_incidents (id, student_id, incident_type, status, severity, description) values
    ('50000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', 'medical', 'open', 'medium', 'pgTAP fixture: cross-hostel attempt')$$,
  '42501',
  null,
  'Reception A (Kalinga): CANNOT insert an incident for the Utkal (cross-hostel) student'
);

-- ==========================================================================
-- INSERT — Reception B (Utkal), own-hostel: ALLOW (reverse direction).
-- ==========================================================================
set local request.jwt.claims to '{"sub": "dddddddd-dddd-dddd-dddd-dddddddddddd"}';
select lives_ok(
  $$insert into security_incidents (id, student_id, incident_type, status, severity, description) values
    ('50000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000002', 'harassment', 'open', 'medium', 'pgTAP fixture: Utkal own-hostel')$$,
  'Reception B (Utkal): CAN insert an own-hostel emergency-category incident'
);

-- ==========================================================================
-- library_incharge: DENIED on the new emergency categories (narrowed by
-- this migration) but UNCHANGED (still allowed) on the ORIGINAL two
-- checkpoint-monitoring types.
-- ==========================================================================
set local request.jwt.claims to '{"sub": "77777777-7777-7777-7777-777777777777"}';
select throws_ok(
  $$insert into security_incidents (id, student_id, incident_type, status) values
    ('50000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000001', 'medical', 'open')$$,
  '42501',
  null,
  'library_incharge: CANNOT insert a new emergency-category incident (medical) — narrowed by Prompt 10, no product reason to manage this domain'
);
select lives_ok(
  $$insert into security_incidents (id, student_id, incident_type, status) values
    ('50000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000001', 'missed_checkpoint', 'open')$$,
  'library_incharge: CAN still insert the ORIGINAL missed_checkpoint type — pre-existing global access completely unaffected'
);
select is(
  (select count(*) from security_incidents where incident_type = 'medical')::int, 0,
  'library_incharge: SELECT on the new emergency categories reflects zero visible rows (same USING clause as the INSERT WITH CHECK above)'
);
select is(
  (select count(*) from security_incidents where id = '50000000-0000-0000-0000-000000000007')::int, 1,
  'library_incharge: CAN still read its own just-inserted missed_checkpoint row'
);

-- ==========================================================================
-- SELECT — Reception A (Kalinga): own-hostel allow, cross-hostel deny,
-- unfiltered count() isolation (anti-enumeration), scoped to the 8
-- emergency categories only (never sees the library_incharge fixture rows
-- above, which are a different incident_type but same-or-different
-- hostel — isolation is per-row regardless of type).
-- ==========================================================================
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';
select is(
  (select count(*) from security_incidents where id = '50000000-0000-0000-0000-000000000001')::int, 1,
  'Reception A (Kalinga): CAN read own-hostel emergency incident'
);
select is(
  (select count(*) from security_incidents where id = '50000000-0000-0000-0000-000000000005')::int, 0,
  'Reception A (Kalinga): CANNOT read cross-hostel emergency incident (Utkal)'
);

-- ==========================================================================
-- SELECT — Reception B (Utkal): reverse isolation.
-- ==========================================================================
set local request.jwt.claims to '{"sub": "dddddddd-dddd-dddd-dddd-dddddddddddd"}';
select is(
  (select count(*) from security_incidents where id = '50000000-0000-0000-0000-000000000005')::int, 1,
  'Reception B (Utkal): CAN read own-hostel emergency incident'
);
select is(
  (select count(*) from security_incidents where id = '50000000-0000-0000-0000-000000000001')::int, 0,
  'Reception B (Utkal): CANNOT read cross-hostel emergency incident (Kalinga)'
);

-- ==========================================================================
-- SELECT — hostel_admin: same isolation shape.
-- ==========================================================================
set local request.jwt.claims to '{"sub": "88888888-8888-8888-8888-888888888888"}';
select is(
  (select count(*) from security_incidents where id = '50000000-0000-0000-0000-000000000001')::int, 1,
  'hostel_admin1 (Kalinga): CAN read own-hostel emergency incident'
);
select is(
  (select count(*) from security_incidents where id = '50000000-0000-0000-0000-000000000005')::int, 0,
  'hostel_admin1 (Kalinga): CANNOT read cross-hostel emergency incident (Utkal)'
);

-- hostel_admin: forged assigned_staff_id also denied (same defense as
-- reception).
select throws_ok(
  $$insert into security_incidents (id, student_id, incident_type, status, severity, description, assigned_staff_id) values
    ('50000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000001', 'infrastructure', 'acknowledged', 'low', 'pgTAP fixture', 'e0000000-0000-0000-0000-000000000006')$$,
  '42501',
  null,
  'hostel_admin1 (Kalinga): CANNOT insert with a forged assigned_staff_id belonging to a different staff member'
);

-- ==========================================================================
-- SELECT — super_admin: global authority across both hostels and every
-- incident type, unaffected by the library narrowing.
-- ==========================================================================
set local request.jwt.claims to '{"sub": "99999999-9999-9999-9999-999999999999"}';
select is(
  (select count(*) from security_incidents where incident_type not in ('missed_checkpoint','manual_flag'))::int, 3,
  'super_admin: retains global authority across both hostels for the 3 successfully-inserted emergency-category fixture rows above (medical, fire, harassment — every forged/cross-hostel/library attempt above was correctly rejected and inserted nothing)'
);

-- ==========================================================================
-- SELECT — student (own) and linked parent: can read their own incident;
-- unrelated parent cannot (unchanged pre-existing policies, re-confirmed
-- against the new emergency-category rows).
-- ==========================================================================
set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111"}';
select is(
  (select count(*) from security_incidents where id = '50000000-0000-0000-0000-000000000001')::int, 1,
  'student1: CAN read their own emergency incident'
);
set local request.jwt.claims to '{"sub": "33333333-3333-3333-3333-333333333333"}';
select is(
  (select count(*) from security_incidents where id = '50000000-0000-0000-0000-000000000001')::int, 1,
  'parent1 (linked father): CAN read student1''s emergency incident'
);
set local request.jwt.claims to '{"sub": "55555555-5555-5555-5555-555555555555"}';
select is(
  (select count(*) from security_incidents where id = '50000000-0000-0000-0000-000000000001')::int, 0,
  'unrelated parent (no relationship to any student): CANNOT read the emergency incident'
);

-- ==========================================================================
-- security_incident_events — RLS scoped through the parent incident's
-- student/hostel relationship, same isolation shape.
-- ==========================================================================
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';
select lives_ok(
  $$insert into security_incident_events (id, incident_id, event_type, actor_staff_id, note) values
    ('51000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'created', 'e0000000-0000-0000-0000-000000000001', null)$$,
  'Reception A (Kalinga): CAN insert an event for its own-hostel incident, actor pinned to own staff id'
);
select throws_ok(
  $$insert into security_incident_events (id, incident_id, event_type, actor_staff_id, note) values
    ('51000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 'note_added', 'e0000000-0000-0000-0000-000000000006', 'forged actor')$$,
  '42501',
  null,
  'Reception A (Kalinga): CANNOT insert an event with a forged actor_staff_id belonging to a different staff member'
);
select throws_ok(
  $$insert into security_incident_events (id, incident_id, event_type, actor_staff_id, note) values
    ('51000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000005', 'note_added', 'e0000000-0000-0000-0000-000000000001', 'cross-hostel attempt')$$,
  '42501',
  null,
  'Reception A (Kalinga): CANNOT insert an event for the Utkal (cross-hostel) incident'
);
select is(
  (select count(*) from security_incident_events where incident_id = '50000000-0000-0000-0000-000000000001')::int, 1,
  'Reception A (Kalinga): CAN read the event timeline for its own-hostel incident'
);
set local request.jwt.claims to '{"sub": "dddddddd-dddd-dddd-dddd-dddddddddddd"}';
select is(
  (select count(*) from security_incident_events where incident_id = '50000000-0000-0000-0000-000000000001')::int, 0,
  'Reception B (Utkal): CANNOT read the event timeline for the Kalinga incident'
);

-- ==========================================================================
-- Immutability — security_incident_events has no UPDATE or DELETE policy
-- for any role, including super_admin.
-- ==========================================================================
set local request.jwt.claims to '{"sub": "99999999-9999-9999-9999-999999999999"}';
update security_incident_events set note = 'tampered' where id = '51000000-0000-0000-0000-000000000001';
select is(
  (select note from security_incident_events where id = '51000000-0000-0000-0000-000000000001'),
  null,
  'super_admin: UPDATE on security_incident_events affects zero rows — no UPDATE policy exists for any role'
);
delete from security_incident_events where id = '51000000-0000-0000-0000-000000000001';
select is(
  (select count(*) from security_incident_events where id = '51000000-0000-0000-0000-000000000001')::int, 1,
  'super_admin: DELETE on security_incident_events affects zero rows — no DELETE policy exists for any role'
);

select * from finish();
rollback;
