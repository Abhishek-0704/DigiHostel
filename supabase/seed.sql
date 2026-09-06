-- Minimal, deterministic, obviously-synthetic local seed data for RLS testing.
-- No real student data, phone numbers, parent information, credentials, or
-- production secrets. All identifiers are fixed test UUIDs for readability
-- in supabase/tests/. Never run against a remote/production project.

-- === auth.users (Supabase Auth identities) ===
-- Minimal GoTrue-compatible rows for local testing only (fake password hash,
-- test email addresses on the example.test domain).
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin,
   confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'student1@example.test', crypt('test-password', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'student2@example.test', crypt('test-password', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'parent1-father@example.test', crypt('test-password', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', 'parent1-mother@example.test', crypt('test-password', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555', 'authenticated', 'authenticated', 'parent-unrelated@example.test', crypt('test-password', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '66666666-6666-6666-6666-666666666666', 'authenticated', 'authenticated', 'reception1@example.test', crypt('test-password', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '77777777-7777-7777-7777-777777777777', 'authenticated', 'authenticated', 'library1@example.test', crypt('test-password', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '88888888-8888-8888-8888-888888888888', 'authenticated', 'authenticated', 'hosteladmin1@example.test', crypt('test-password', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-9999-9999-999999999999', 'authenticated', 'authenticated', 'superadmin1@example.test', crypt('test-password', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'guardian-of-student2@example.test', crypt('test-password', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'authenticated', 'authenticated', 'hosteladmin2@example.test', crypt('test-password', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'authenticated', 'authenticated', 'reception2@example.test', crypt('test-password', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', '');

-- === Hostel domain ===
insert into hostels (id, name) values
  ('a0000000-0000-0000-0000-000000000001', 'Test Hostel Kalinga'),
  ('a0000000-0000-0000-0000-000000000002', 'Test Hostel Utkal');

insert into rooms (id, hostel_id, room_number) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '101'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', '201');

-- === Identity domain ===
-- student1: has two linked parents (father, mother) — used for escalation-order tests.
insert into students (id, auth_user_id, roll_number, full_name, hostel_id, room_id) values
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'TEST-S001', 'Test Student One', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001');

-- student2: different hostel, NOT linked to parent1/parent2 — used to prove
-- "parent cannot access another student's data unless the relationship exists".
insert into students (id, auth_user_id, roll_number, full_name, hostel_id, room_id) values
  ('c0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'TEST-S002', 'Test Student Two', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002');

insert into parents (id, auth_user_id, full_name, phone_number) values
  ('d0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'Test Father One', '+91-9000000001'),
  ('d0000000-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444444', 'Test Mother One', '+91-9000000002'),
  ('d0000000-0000-0000-0000-000000000003', '55555555-5555-5555-5555-555555555555', 'Test Unrelated Parent', '+91-9000000003'),
  ('d0000000-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test Guardian Of Two', '+91-9000000004');

insert into staff (id, auth_user_id, full_name, role, hostel_id) values
  ('e0000000-0000-0000-0000-000000000001', '66666666-6666-6666-6666-666666666666', 'Test Reception Warden', 'reception_warden', 'a0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-000000000002', '77777777-7777-7777-7777-777777777777', 'Test Library Incharge', 'library_incharge', null),
  ('e0000000-0000-0000-0000-000000000003', '88888888-8888-8888-8888-888888888888', 'Test Hostel Admin', 'hostel_admin', 'a0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-000000000004', '99999999-9999-9999-9999-999999999999', 'Test Super Admin', 'super_admin', null),
  -- hostel_admin2: scoped to Utkal (student2's hostel), NOT Kalinga — used by
  -- F-05's cross-hostel security_incidents isolation tests (docs/adr and
  -- supabase/tests/database/13_f05_security_incidents_hostel_scope.sql).
  ('e0000000-0000-0000-0000-000000000005', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Test Hostel Admin Two', 'hostel_admin', 'a0000000-0000-0000-0000-000000000002'),
  -- reception2 ("Reception B"): scoped to Utkal, NOT Kalinga — used by F-05A's
  -- cross-hostel security_incidents reception-isolation tests
  -- (supabase/tests/database/14_f05a_security_incidents_reception_scope.sql).
  ('e0000000-0000-0000-0000-000000000006', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Test Reception Warden Two', 'reception_warden', 'a0000000-0000-0000-0000-000000000002');

insert into parent_student_relationships (parent_id, student_id, relationship_type, escalation_order) values
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'father', 1),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'mother', 2);
-- Note: parent3 (d...003) is deliberately NOT linked to any student — the
-- "parent cannot access another student's data" negative-test fixture.

-- student2's guardian (distinct from student1's father/mother) — used to
-- prove "guardian access follows the guardian relationship" specifically.
insert into parent_student_relationships (parent_id, student_id, relationship_type, escalation_order) values
  ('d0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', 'guardian', 1);

-- === Device/security domain ===
-- parent1 (father) has one active trusted device.
insert into trusted_devices (id, parent_id, platform, device_fingerprint, revoked_at) values
  ('f0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'android', 'test-fingerprint-active-001', null);

-- parent2 (mother) has only a REVOKED device — used to test "revoked devices
-- cannot perform protected operations".
insert into trusted_devices (id, parent_id, platform, device_fingerprint, revoked_at, revoked_reason) values
  ('f0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 'ios', 'test-fingerprint-revoked-001', now(), 'test: device removed by user');

-- === Parent approval domain ===
insert into leave_requests (id, student_id, reason, start_date, end_date, status) values
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Test: family function', '2026-10-01', '2026-10-03', 'father_notified');

insert into leave_approval_events (id, leave_request_id, event_type, actor_parent_id, biometric_confirmed, occurred_at) values
  ('11000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'notified', null, false, now());

-- === Security incident domain ===
-- incident1: student1's incident, at Kalinga (Hostel A).
-- incident2: student2's incident, at Utkal (Hostel B) — used to prove a
-- Kalinga-scoped hostel_admin cannot read/write a Utkal student's incident,
-- and vice versa (F-05 cross-hostel isolation).
insert into security_incidents (id, student_id, incident_type, status) values
  ('12000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'missed_checkpoint', 'open'),
  ('12000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'manual_flag', 'open');

-- === Audit domain ===
-- Inserted here as the seed script's postgres/superuser connection, which
-- bypasses RLS entirely — exactly like Fastify's service-role connection
-- would in the real system. No client role can produce this row itself.
insert into audit_logs (actor_type, actor_id, action, entity_type, entity_id, metadata) values
  ('system', null, 'leave.notified', 'leave_requests', '10000000-0000-0000-0000-000000000001', '{"test": true}');
