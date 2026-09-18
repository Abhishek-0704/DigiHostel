-- Phase 3, Prompt 7C — Student Verification & Exit Authorization.
--
-- RLS coverage for the new `leave_exit_authorizations` table
-- (supabase/migrations/0011_exit_authorization.sql,
-- packages/db/src/schema/leave.ts). Mirrors the exact hostel-scoping shape
-- already proven for `leave_approval_events`
-- (17_lae_select_staff_hostel_scope.sql) — same role split
-- (reception/hostel_admin/super_admin scoped or unscoped by
-- is_reception_for_student/is_hostel_admin_for_student/super_admin;
-- library_incharge gets no policy at all), plus this table's own new
-- INSERT-time invariants: `identity_confirmed = true` required, the actor
-- must be the caller's own resolved staff id, hostel match required, and
-- the UNIQUE(leave_request_id) constraint enforcing "at most one exit
-- authorization per leave request" at the database level.

begin;
select plan(27);

-- ==========================================================================
-- Non-privileged-session guard.
-- ==========================================================================
select isnt(
  current_setting('is_superuser'), 'on',
  'guard: the outer connection is a superuser (expected — proves the SET ROLE below is a genuine privilege drop, not a no-op)'
);

-- ==========================================================================
-- Temporary two-hostel fixture (rolled back with the transaction) — two
-- leave_requests, already `approved` (the real precondition state Exit
-- Authorization requires), one per hostel/student.
-- ==========================================================================
reset role;
insert into leave_requests (id, student_id, reason, start_date, end_date, status) values
  ('20000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'pgTAP exit-authorization fixture (Kalinga)', '2026-11-10', '2026-11-12', 'approved'),
  ('20000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'pgTAP exit-authorization fixture (Utkal)', '2026-11-10', '2026-11-12', 'approved');

-- ==========================================================================
-- F-QG02-01 (QG-02 Leave Authorization Workflow Review) fixtures — one
-- Kalinga leave request per non-approved status this table's own state
-- machine can produce. QG-02's live exploit inserted an exit authorization
-- for a leave request that was never approved; the ORIGINAL version of this
-- suite could not have caught it because every fixture above was pre-seeded
-- as already 'approved'. These fixtures close that specific coverage gap.
-- ==========================================================================
insert into leave_requests (id, student_id, reason, start_date, end_date, status) values
  ('20000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000001', 'pgTAP F-QG02-01 fixture (pending)', '2026-11-10', '2026-11-12', 'pending'),
  ('20000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000001', 'pgTAP F-QG02-01 fixture (father_notified)', '2026-11-10', '2026-11-12', 'father_notified'),
  ('20000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000001', 'pgTAP F-QG02-01 fixture (rejected)', '2026-11-10', '2026-11-12', 'rejected'),
  ('20000000-0000-0000-0000-000000000013', 'c0000000-0000-0000-0000-000000000001', 'pgTAP F-QG02-01 fixture (expired)', '2026-11-10', '2026-11-12', 'expired'),
  ('20000000-0000-0000-0000-000000000014', 'c0000000-0000-0000-0000-000000000001', 'pgTAP F-QG02-01 fixture (manual_verification)', '2026-11-10', '2026-11-12', 'manual_verification');

-- ==========================================================================
-- INSERT — Reception A (Kalinga), own-hostel, correct actor, confirmed
-- identity: ALLOW.
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';
select lives_ok(
  $$insert into leave_exit_authorizations (id, leave_request_id, authorized_by_staff_id, identity_confirmed) values
    ('21000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', true)$$,
  'Reception A (Kalinga): CAN insert exit authorization for own-hostel leave request (correct actor, identity_confirmed=true)'
);

-- ==========================================================================
-- UNIQUE constraint — a second exit authorization for the SAME leave
-- request is rejected at the database level (not merely by application code).
-- ==========================================================================
select throws_ok(
  $$insert into leave_exit_authorizations (id, leave_request_id, authorized_by_staff_id, identity_confirmed) values
    ('21000000-0000-0000-0000-000000000099', '20000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', true)$$,
  '23505',
  null,
  'UNIQUE(leave_request_id): a second exit authorization for the same leave request is rejected (unique_violation, 23505) — database-enforced "at most one exit per leave request"'
);

-- ==========================================================================
-- F-QG02-01 — workflow-state precondition (QG-02 Leave Authorization
-- Workflow Review, remediated). An otherwise fully-authorized Reception A
-- (Kalinga) session — correct actor id, correct hostel, identity_confirmed
-- = true, exactly the shape that succeeded above for the 'approved' fixture
-- — must be DENIED for every one of this leave request's own non-approved
-- statuses. This is the exact precondition QG-02's live PostgREST exploit
-- defeated (a 'pending' leave accepted an exit authorization); every
-- fixture above this point in the file was already 'approved', so this
-- block is what actually proves the fix, not merely that the table's other
-- invariants still hold.
-- ==========================================================================
select throws_ok(
  $$insert into leave_exit_authorizations (id, leave_request_id, authorized_by_staff_id, identity_confirmed) values
    ('21000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000010', 'e0000000-0000-0000-0000-000000000001', true)$$,
  '42501',
  null,
  'F-QG02-01: Reception A (Kalinga), otherwise fully authorized — CANNOT insert exit authorization for a PENDING leave request'
);
select throws_ok(
  $$insert into leave_exit_authorizations (id, leave_request_id, authorized_by_staff_id, identity_confirmed) values
    ('21000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000011', 'e0000000-0000-0000-0000-000000000001', true)$$,
  '42501',
  null,
  'F-QG02-01: Reception A (Kalinga) — CANNOT insert exit authorization for a FATHER_NOTIFIED leave request (parent has not yet decided)'
);
select throws_ok(
  $$insert into leave_exit_authorizations (id, leave_request_id, authorized_by_staff_id, identity_confirmed) values
    ('21000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000012', 'e0000000-0000-0000-0000-000000000001', true)$$,
  '42501',
  null,
  'F-QG02-01: Reception A (Kalinga) — CANNOT insert exit authorization for a REJECTED leave request'
);
select throws_ok(
  $$insert into leave_exit_authorizations (id, leave_request_id, authorized_by_staff_id, identity_confirmed) values
    ('21000000-0000-0000-0000-000000000013', '20000000-0000-0000-0000-000000000013', 'e0000000-0000-0000-0000-000000000001', true)$$,
  '42501',
  null,
  'F-QG02-01: Reception A (Kalinga) — CANNOT insert exit authorization for an EXPIRED leave request'
);
select throws_ok(
  $$insert into leave_exit_authorizations (id, leave_request_id, authorized_by_staff_id, identity_confirmed) values
    ('21000000-0000-0000-0000-000000000014', '20000000-0000-0000-0000-000000000014', 'e0000000-0000-0000-0000-000000000001', true)$$,
  '42501',
  null,
  'F-QG02-01: Reception A (Kalinga) — CANNOT insert exit authorization for a MANUAL_VERIFICATION leave request (not yet resolved to approved)'
);

-- super_admin, otherwise fully authorized, is also gated by the same
-- workflow-state precondition — lxa_insert_super_admin previously had NO
-- join to leave_requests at all (worse than lxa_insert_staff's original
-- gap, which at least confirmed the row existed in-hostel). Switches to the
-- super_admin identity for this one assertion, then switches back to
-- Reception A (Kalinga) below — every test after this point in the file
-- assumes that context.
set local request.jwt.claims to '{"sub": "99999999-9999-9999-9999-999999999999"}';
select throws_ok(
  $$insert into leave_exit_authorizations (id, leave_request_id, authorized_by_staff_id, identity_confirmed) values
    ('21000000-0000-0000-0000-000000000015', '20000000-0000-0000-0000-000000000010', 'e0000000-0000-0000-0000-000000000004', true)$$,
  '42501',
  null,
  'F-QG02-01: super_admin, otherwise fully authorized — CANNOT insert exit authorization for a PENDING leave request'
);
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';

-- ==========================================================================
-- INSERT — identity_confirmed = false: DENY (RLS withCheck, not merely a
-- NOT NULL constraint — a false attestation must never be accepted).
-- ==========================================================================
select throws_ok(
  $$insert into leave_exit_authorizations (id, leave_request_id, authorized_by_staff_id, identity_confirmed) values
    ('21000000-0000-0000-0000-000000000098', '20000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', false)$$,
  '42501',
  null,
  'identity_confirmed=false: REJECTED by RLS (insufficient_privilege, 42501) even from an otherwise-authorized reception session'
);

-- ==========================================================================
-- INSERT — forged actor id (a real staff id belonging to someone else):
-- DENY. Proves `authorized_by_staff_id` cannot be set to any value other
-- than the caller's own resolved staff id.
-- ==========================================================================
select throws_ok(
  $$insert into leave_exit_authorizations (id, leave_request_id, authorized_by_staff_id, identity_confirmed) values
    ('21000000-0000-0000-0000-000000000097', '20000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000003', true)$$,
  '42501',
  null,
  'forged authorized_by_staff_id (a real, different staff member''s id): REJECTED — the actor id must equal the caller''s own resolved staff id'
);

-- ==========================================================================
-- INSERT — cross-hostel: Reception A (Kalinga) attempting to authorize an
-- exit for the Utkal fixture: DENY.
-- ==========================================================================
select throws_ok(
  $$insert into leave_exit_authorizations (id, leave_request_id, authorized_by_staff_id, identity_confirmed) values
    ('21000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', true)$$,
  '42501',
  null,
  'Reception A (Kalinga): CANNOT insert exit authorization for the Utkal (cross-hostel) leave request'
);

-- ==========================================================================
-- INSERT — Reception B (Utkal), own-hostel: ALLOW (the reverse direction,
-- proving the scope is genuinely bidirectional, not incidentally one-way).
-- ==========================================================================
set local request.jwt.claims to '{"sub": "dddddddd-dddd-dddd-dddd-dddddddddddd"}';
select lives_ok(
  $$insert into leave_exit_authorizations (id, leave_request_id, authorized_by_staff_id, identity_confirmed) values
    ('21000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000006', true)$$,
  'Reception B (Utkal): CAN insert exit authorization for own-hostel leave request'
);

-- ==========================================================================
-- SELECT — Reception A (Kalinga): own-hostel allow, cross-hostel deny,
-- unfiltered count() isolation (anti-enumeration).
-- ==========================================================================
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';
select is(
  (select count(*) from leave_exit_authorizations where id = '21000000-0000-0000-0000-000000000001')::int, 1,
  'Reception A (Kalinga): CAN read own-hostel exit authorization'
);
select is(
  (select count(*) from leave_exit_authorizations where id = '21000000-0000-0000-0000-000000000002')::int, 0,
  'Reception A (Kalinga): CANNOT read cross-hostel exit authorization (Utkal)'
);
select is(
  (select count(*) from leave_exit_authorizations)::int, 1,
  'Reception A (Kalinga): unfiltered count() reflects only own-hostel rows (no enumeration leak)'
);

-- ==========================================================================
-- SELECT — Reception B (Utkal): reverse isolation.
-- ==========================================================================
set local request.jwt.claims to '{"sub": "dddddddd-dddd-dddd-dddd-dddddddddddd"}';
select is(
  (select count(*) from leave_exit_authorizations where id = '21000000-0000-0000-0000-000000000002')::int, 1,
  'Reception B (Utkal): CAN read own-hostel exit authorization'
);
select is(
  (select count(*) from leave_exit_authorizations where id = '21000000-0000-0000-0000-000000000001')::int, 0,
  'Reception B (Utkal): CANNOT read cross-hostel exit authorization (Kalinga)'
);

-- ==========================================================================
-- SELECT — hostel_admin: same isolation shape as reception (independent
-- policy).
-- ==========================================================================
set local request.jwt.claims to '{"sub": "88888888-8888-8888-8888-888888888888"}';
select is(
  (select count(*) from leave_exit_authorizations where id = '21000000-0000-0000-0000-000000000001')::int, 1,
  'hostel_admin1 (Kalinga): CAN read own-hostel exit authorization'
);
select is(
  (select count(*) from leave_exit_authorizations where id = '21000000-0000-0000-0000-000000000002')::int, 0,
  'hostel_admin1 (Kalinga): CANNOT read cross-hostel exit authorization (Utkal)'
);

-- ==========================================================================
-- SELECT — library_incharge: no policy at all, matching every other
-- leave-domain table's complete absence of a grant for this role.
-- ==========================================================================
set local request.jwt.claims to '{"sub": "77777777-7777-7777-7777-777777777777"}';
select is(
  (select count(*) from leave_exit_authorizations)::int, 0,
  'library_incharge: CANNOT read any leave_exit_authorizations row — no grant on leave-domain data anywhere in this schema'
);

-- ==========================================================================
-- SELECT — super_admin: global authority.
-- ==========================================================================
set local request.jwt.claims to '{"sub": "99999999-9999-9999-9999-999999999999"}';
select is(
  (select count(*) from leave_exit_authorizations)::int, 2,
  'super_admin: retains global authority across both hostels'
);

-- ==========================================================================
-- SELECT — student (own) and linked parent: can read their own exit
-- authorization record; unrelated parent cannot.
-- ==========================================================================
set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111"}';
select is(
  (select count(*) from leave_exit_authorizations where id = '21000000-0000-0000-0000-000000000001')::int, 1,
  'student1: CAN read their own exit authorization record'
);
set local request.jwt.claims to '{"sub": "33333333-3333-3333-3333-333333333333"}';
select is(
  (select count(*) from leave_exit_authorizations where id = '21000000-0000-0000-0000-000000000001')::int, 1,
  'parent1 (linked father): CAN read student1''s exit authorization record'
);
set local request.jwt.claims to '{"sub": "55555555-5555-5555-5555-555555555555"}';
select is(
  (select count(*) from leave_exit_authorizations)::int, 0,
  'unrelated parent (no relationship to any student): CANNOT read any exit authorization record'
);

-- ==========================================================================
-- Immutability — no UPDATE or DELETE policy exists for ANY role, including
-- super_admin: an exit authorization, once recorded, is permanent.
-- ==========================================================================
set local request.jwt.claims to '{"sub": "99999999-9999-9999-9999-999999999999"}';
-- No UPDATE/DELETE policy exists for any role, so RLS makes zero rows
-- visible to either statement — it succeeds but silently affects nothing,
-- it does not raise (the same pattern already established for
-- leave_approval_events, 07_approval_immutability.sql).
update leave_exit_authorizations set identity_confirmed = false where id = '21000000-0000-0000-0000-000000000001';
select is(
  (select identity_confirmed from leave_exit_authorizations where id = '21000000-0000-0000-0000-000000000001'),
  true,
  'super_admin: UPDATE affects zero rows — no UPDATE policy exists for any role (immutable by construction)'
);
delete from leave_exit_authorizations where id = '21000000-0000-0000-0000-000000000001';
select is(
  (select count(*) from leave_exit_authorizations where id = '21000000-0000-0000-0000-000000000001')::int, 1,
  'super_admin: DELETE affects zero rows — no DELETE policy exists for any role (immutable by construction)'
);

select * from finish();
rollback;
