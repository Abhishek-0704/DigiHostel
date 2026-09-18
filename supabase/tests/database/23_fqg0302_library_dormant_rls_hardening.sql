-- QG-03 remediation — Finding F-QG03-02 (MAJOR).
--
-- Prior state (the vulnerability): the dormant Library schema's
-- reception-facing policies — `qr_sessions_all_reception_library`,
-- `journey_events_select_reception_library`,
-- `journey_events_insert_reception_library` (all present, unfixed, since
-- 0000_cute_korvac.sql) — granted `reception_warden` access via a bare
-- `current_staff_role() = 'reception_warden' or current_staff_role() =
-- 'library_incharge'` check, with NO hostel join for reception at all —
-- unlike this same schema file's own `library_passes_all_reception` policy,
-- which was already correctly scoped from the start. This table pair has
-- zero Fastify route surface today (confirmed by repository search), so
-- this was NOT exploitable through the certified Reception Dashboard
-- application — but it is an unsafe pre-provisioned direct-PostgREST
-- boundary that must not be inherited unexamined by Library Operations.
--
-- Remediation (supabase/migrations/0019_fqg0301_fqg0302_hostel_scope_remediation.sql):
-- split each combined policy into a reception policy (scoped via the new
-- `public.is_reception_for_library_pass` SECURITY DEFINER helper — join
-- library_passes -> students -> hostel_id) and an unchanged, intentionally
-- global library_incharge policy, mirroring library_passes_all_reception's
-- own established shape and the F-05A precedent for this exact class of fix.
--
-- No seed fixture data exists for library_passes/qr_sessions/journey_events
-- (this domain is genuinely dormant) — this file inserts its own complete,
-- self-contained fixture set, rolled back at the end like every other
-- fixture insert in this suite.

begin;
select plan(25);

select isnt(
  current_setting('is_superuser'), 'on',
  'guard: the outer connection is a superuser (expected — proves the SET ROLE below is a genuine privilege drop, not a no-op)'
);

reset role;

-- ==========================================================================
-- Fixtures: one active library pass + one QR session per hostel's seeded
-- student (student1/Kalinga, student2/Utkal).
-- ==========================================================================
insert into library_passes (id, student_id, status) values
  ('e1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'active'),
  ('e1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'active');

insert into qr_sessions (id, library_pass_id, checkpoint_type, token_hash, expires_at) values
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'library_entry', 'test-token-hash-001', now() + interval '5 minutes'),
  ('e2000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000002', 'library_entry', 'test-token-hash-002', now() + interval '5 minutes');

-- ==========================================================================
-- qr_sessions — SELECT/UPDATE, reception scope.
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';

select is(
  (select count(*) from qr_sessions where id = 'e2000000-0000-0000-0000-000000000001')::int, 1,
  'reception1 (Kalinga): CAN read the QR session for its own-hostel student''s library pass'
);
select is(
  (select count(*) from qr_sessions where id = 'e2000000-0000-0000-0000-000000000002')::int, 0,
  'reception1 (Kalinga): CANNOT read the QR session for the Utkal student''s library pass'
);

update qr_sessions set token_hash = 'forged-hash' where id = 'e2000000-0000-0000-0000-000000000002';
reset role;
select is(
  (select token_hash from qr_sessions where id = 'e2000000-0000-0000-0000-000000000002')::text, 'test-token-hash-002',
  'reception1 (Kalinga): cross-hostel UPDATE on the Utkal QR session affected zero rows (unchanged)'
);

set local role authenticated;
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';
update qr_sessions set used_at = now() where id = 'e2000000-0000-0000-0000-000000000001';
reset role;
select isnt(
  (select used_at from qr_sessions where id = 'e2000000-0000-0000-0000-000000000001'), null,
  'reception1 (Kalinga): CAN legitimately update its own-hostel QR session (used_at now set) — write not overcorrected away'
);

-- library_incharge: unchanged, global access to both.
set local role authenticated;
set local request.jwt.claims to '{"sub": "77777777-7777-7777-7777-777777777777"}';
select is(
  (select count(*) from qr_sessions)::int, 2,
  'library_incharge: retains GLOBAL access to both hostels'' QR sessions (unaffected by this fix)'
);

-- role-switch: reception2 (Utkal) sees the reverse.
set local request.jwt.claims to '{"sub": "dddddddd-dddd-dddd-dddd-dddddddddddd"}';
select is(
  (select count(*) from qr_sessions where id = 'e2000000-0000-0000-0000-000000000002')::int, 1,
  'role-switch: reception2 (Utkal) CAN read its own-hostel QR session'
);
select is(
  (select count(*) from qr_sessions where id = 'e2000000-0000-0000-0000-000000000001')::int, 0,
  'role-switch: reception2 (Utkal) CANNOT read the Kalinga QR session'
);

-- super_admin: unchanged.
set local request.jwt.claims to '{"sub": "99999999-9999-9999-9999-999999999999"}';
select is(
  (select count(*) from qr_sessions)::int, 2,
  'regression: super_admin still sees every QR session across both hostels'
);

-- Own-student access (qr_sessions_select_own_student, untouched by this fix).
set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111"}';
select is(
  (select count(*) from qr_sessions where id = 'e2000000-0000-0000-0000-000000000001')::int, 1,
  'regression: student1 can still read their own QR session (qr_sessions_select_own_student unaffected)'
);

-- ==========================================================================
-- journey_events — INSERT/SELECT, reception scope. The forged-actor
-- (`verified_by_staff_id`) and forged-attestation (`biometric_confirmed`)
-- checks that already existed on the combined policy must survive the
-- split unchanged.
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';

select lives_ok(
  $$insert into journey_events (id, library_pass_id, qr_session_id, checkpoint_type, verified_by_staff_id, biometric_confirmed) values
    ('e3000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'library_entry', 'e0000000-0000-0000-0000-000000000001', true)$$,
  'reception1 (Kalinga): CAN insert a journey event for its own-hostel student''s library pass, actor pinned to own staff id'
);

select throws_ok(
  $$insert into journey_events (id, library_pass_id, qr_session_id, checkpoint_type, verified_by_staff_id, biometric_confirmed) values
    ('e3000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-000000000002', 'library_entry', 'e0000000-0000-0000-0000-000000000001', true)$$,
  '42501',
  null,
  'reception1 (Kalinga): CANNOT insert a journey event for the Utkal student''s library pass (cross-hostel)'
);

select throws_ok(
  $$insert into journey_events (id, library_pass_id, qr_session_id, checkpoint_type, verified_by_staff_id, biometric_confirmed) values
    ('e3000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'library_entry', 'e0000000-0000-0000-0000-000000000006', true)$$,
  '42501',
  null,
  'reception1 (Kalinga): CANNOT insert a journey event with a forged verified_by_staff_id belonging to a different staff member (pre-existing check preserved by the split)'
);

select throws_ok(
  $$insert into journey_events (id, library_pass_id, qr_session_id, checkpoint_type, verified_by_staff_id, biometric_confirmed) values
    ('e3000000-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'library_entry', 'e0000000-0000-0000-0000-000000000001', false)$$,
  '42501',
  null,
  'reception1 (Kalinga): CANNOT insert a journey event with biometric_confirmed=false (pre-existing check preserved by the split)'
);

select is(
  (select count(*) from journey_events where library_pass_id = 'e1000000-0000-0000-0000-000000000001')::int, 1,
  'reception1 (Kalinga): CAN read the journey event for its own-hostel student''s library pass'
);
select is(
  (select count(*) from journey_events where library_pass_id = 'e1000000-0000-0000-0000-000000000002')::int, 0,
  'reception1 (Kalinga): CANNOT read journey events for the Utkal student''s library pass (none exist to leak, and none could have been inserted above)'
);

-- library_incharge: can insert/select for the Utkal pass too (unchanged, global).
set local request.jwt.claims to '{"sub": "77777777-7777-7777-7777-777777777777"}';
select lives_ok(
  $$insert into journey_events (id, library_pass_id, qr_session_id, checkpoint_type, verified_by_staff_id, biometric_confirmed) values
    ('e3000000-0000-0000-0000-000000000005', 'e1000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-000000000002', 'library_entry', 'e0000000-0000-0000-0000-000000000002', true)$$,
  'library_incharge: CAN insert a journey event for the Utkal student''s library pass (retains GLOBAL access, unaffected by this fix)'
);
select is(
  (select count(*) from journey_events)::int, 2,
  'library_incharge: CAN read journey events across both hostels (GLOBAL access unaffected)'
);

-- role-switch: reception2 (Utkal) sees only its own hostel's journey event.
set local request.jwt.claims to '{"sub": "dddddddd-dddd-dddd-dddd-dddddddddddd"}';
select is(
  (select count(*) from journey_events where library_pass_id = 'e1000000-0000-0000-0000-000000000002')::int, 1,
  'role-switch: reception2 (Utkal) CAN read the journey event for its own-hostel student''s library pass'
);
select is(
  (select count(*) from journey_events where library_pass_id = 'e1000000-0000-0000-0000-000000000001')::int, 0,
  'role-switch: reception2 (Utkal) CANNOT read the Kalinga journey event'
);

-- super_admin: unchanged.
set local request.jwt.claims to '{"sub": "99999999-9999-9999-9999-999999999999"}';
select is(
  (select count(*) from journey_events)::int, 2,
  'regression: super_admin still sees every journey event across both hostels'
);

-- Own-student / linked-parent access (untouched by this fix).
set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111"}';
select is(
  (select count(*) from journey_events where library_pass_id = 'e1000000-0000-0000-0000-000000000001')::int, 1,
  'regression: student1 can still read their own journey event (journey_events_select_own_student unaffected)'
);
set local request.jwt.claims to '{"sub": "33333333-3333-3333-3333-333333333333"}';
select is(
  (select count(*) from journey_events where library_pass_id = 'e1000000-0000-0000-0000-000000000001')::int, 1,
  'regression: student1''s linked parent (father) can still read student1''s journey event (journey_events_select_linked_parent unaffected)'
);

-- Regression: library_passes_all_reception (the policy this domain's
-- reception scope was always supposed to match) is unaffected by this fix.
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';
select is(
  (select count(*) from library_passes where id = 'e1000000-0000-0000-0000-000000000001')::int, 1,
  'regression: reception1 (Kalinga) still has correctly-scoped access to library_passes (untouched by this migration)'
);
select is(
  (select count(*) from library_passes where id = 'e1000000-0000-0000-0000-000000000002')::int, 0,
  'regression: reception1 (Kalinga) still correctly denied on the Utkal library_pass (untouched by this migration)'
);

select * from finish();
rollback;
