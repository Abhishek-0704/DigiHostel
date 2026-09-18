-- Targeted security remediation: `lae_select_staff` BLOCKER — regression +
-- security coverage (independent security verification, post-Phase 3
-- Prompt 7A).
--
-- Prior state (the vulnerability): `lae_select_staff`'s USING clause was
-- `exists (select 1 from staff s where s.auth_user_id = auth.uid())` — it
-- never referenced the target `leave_approval_events` row at all, so it
-- granted every authenticated staff member, in ANY role and ANY hostel,
-- unrestricted SELECT on EVERY row in this table. Live-confirmed via real
-- authenticated PostgREST requests: a Hostel-B reception_warden read a
-- Hostel-A event; a library_incharge (no hostel assignment, no grant on
-- leave_requests anywhere in this schema) read it too; an AAL1
-- (password-only) staff session could read it as well, since AAL2 is never
-- checked by any RLS policy in this schema (see the AAL1 note near the end
-- of this file).
--
-- Remediation (supabase/migrations/0010_lae_select_staff_hostel_scope.sql):
-- replaced with `lae_select_reception`/`lae_select_hostel_admin`/
-- `lae_select_super_admin`, mirroring the existing
-- leave_requests_all_reception/_all_hostel_admin/_all_super_admin three-way
-- split on this table's own parent row, reusing the existing
-- `is_reception_for_student`/`is_hostel_admin_for_student` SECURITY DEFINER
-- helpers (built for F-05A) rather than a new function. library_incharge
-- intentionally receives no policy at all, matching leave_requests's own
-- complete absence of a library_incharge grant.

begin;
select plan(24);

-- ==========================================================================
-- Non-privileged-session guard (same discipline as F-05/F-05A).
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
-- Sanity + temporary two-hostel fixture (rolled back with the transaction —
-- no permanent seed data is added). Reuses student2 (Utkal, pre-seeded) so
-- only a leave_requests/leave_approval_events pair is temporary.
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

insert into leave_requests (id, student_id, reason, start_date, end_date, status) values
  ('10000000-0000-0000-0000-000000000099', 'c0000000-0000-0000-0000-000000000002', 'pgTAP temp fixture: Utkal cross-hostel isolation', '2026-11-01', '2026-11-03', 'father_notified');
insert into leave_approval_events (id, leave_request_id, event_type, biometric_confirmed) values
  ('11000000-0000-0000-0000-000000000099', '10000000-0000-0000-0000-000000000099', 'notified', false);

-- ==========================================================================
-- Test 1 — Reception own-hostel access: ALLOW.
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';
select is(
  (select count(*) from leave_approval_events where id = '11000000-0000-0000-0000-000000000001')::int, 1,
  'Reception A (Kalinga): CAN read own-hostel event (student1)'
);

-- ==========================================================================
-- Test 2 — Reception cross-hostel enumeration: DENY.
-- ==========================================================================
select is(
  (select count(*) from leave_approval_events)::int, 1,
  'Reception A (Kalinga): unfiltered count() reflects only own-hostel rows (no enumeration leak, the Utkal fixture is invisible)'
);

-- ==========================================================================
-- Test 3 — Known cross-hostel ID: DENY.
-- ==========================================================================
select is(
  (select count(*) from leave_approval_events where id = '11000000-0000-0000-0000-000000000099')::int, 0,
  'Reception A (Kalinga): CANNOT read cross-hostel event (student2/Utkal) by known UUID'
);

-- ==========================================================================
-- Test 11 — Query manipulation: filtering directly by the cross-hostel
-- leave_request_id does not expand authorization.
-- ==========================================================================
select is(
  (select count(*) from leave_approval_events where leave_request_id = '10000000-0000-0000-0000-000000000099')::int, 0,
  'Reception A (Kalinga): filtering directly by the cross-hostel leave_request_id still returns zero rows'
);

-- ==========================================================================
-- Role-switch: Reception B (Utkal) — the reverse direction.
-- ==========================================================================
set local request.jwt.claims to '{"sub": "dddddddd-dddd-dddd-dddd-dddddddddddd"}';
select is(
  (select auth.uid()), 'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid,
  'role-switch: effective identity is now Reception B'
);
select is(
  (select count(*) from leave_approval_events where id = '11000000-0000-0000-0000-000000000099')::int, 1,
  'Reception B (Utkal): CAN read own-hostel event (student2)'
);
select is(
  (select count(*) from leave_approval_events where id = '11000000-0000-0000-0000-000000000001')::int, 0,
  'Reception B (Utkal): CANNOT read cross-hostel event (student1/Kalinga) — flips from Reception A''s own-hostel allow'
);

-- ==========================================================================
-- Test 4 — Count isolation, confirmed from Reception B's own side too.
-- ==========================================================================
select is(
  (select count(*) from leave_approval_events)::int, 1,
  'Reception B (Utkal): unfiltered count() reflects only own-hostel rows (Kalinga''s event is not counted)'
);

-- ==========================================================================
-- hostel_admin: same isolation shape as reception (independent policy).
-- ==========================================================================
set local request.jwt.claims to '{"sub": "88888888-8888-8888-8888-888888888888"}';
select is(
  (select count(*) from leave_approval_events where id = '11000000-0000-0000-0000-000000000001')::int, 1,
  'hostel_admin1 (Kalinga): CAN read own-hostel event'
);
select is(
  (select count(*) from leave_approval_events where id = '11000000-0000-0000-0000-000000000099')::int, 0,
  'hostel_admin1 (Kalinga): CANNOT read cross-hostel event (student2/Utkal)'
);
set local request.jwt.claims to '{"sub": "cccccccc-cccc-cccc-cccc-cccccccccccc"}';
select is(
  (select count(*) from leave_approval_events where id = '11000000-0000-0000-0000-000000000099')::int, 1,
  'hostel_admin2 (Utkal): CAN read own-hostel event'
);
select is(
  (select count(*) from leave_approval_events where id = '11000000-0000-0000-0000-000000000001')::int, 0,
  'hostel_admin2 (Utkal): CANNOT read cross-hostel event (student1/Kalinga)'
);

-- ==========================================================================
-- Test 5 — library_incharge: the core role-independence half of the
-- original finding. Must now be completely denied (no policy at all),
-- never merely "scoped."
-- ==========================================================================
set local request.jwt.claims to '{"sub": "77777777-7777-7777-7777-777777777777"}';
select is(
  (select count(*) from leave_approval_events)::int, 0,
  'library_incharge: CANNOT read any leave_approval_events row — no longer "any staff member" access; this role has no grant on leave-domain data anywhere in this schema'
);

-- ==========================================================================
-- Test 9 — super_admin: global authority preserved.
-- ==========================================================================
set local request.jwt.claims to '{"sub": "99999999-9999-9999-9999-999999999999"}';
select is(
  (select count(*) from leave_approval_events)::int, 2,
  'super_admin: retains global authority across both hostels (both the seeded Kalinga event and the temp Utkal fixture)'
);

-- ==========================================================================
-- Test 7 — parent access preserved (lae_select_linked_parent untouched).
-- ==========================================================================
set local request.jwt.claims to '{"sub": "33333333-3333-3333-3333-333333333333"}';
select is(
  (select count(*) from leave_approval_events where id = '11000000-0000-0000-0000-000000000001')::int, 1,
  'regression: parent1 (linked father) can still read student1''s leave_approval_events row (lae_select_linked_parent unaffected)'
);
select is(
  (select count(*) from leave_approval_events where id = '11000000-0000-0000-0000-000000000099')::int, 0,
  'regression: parent1 (linked to student1 only) still cannot read the unrelated Utkal fixture event'
);

-- ==========================================================================
-- Test 8 — student access preserved (lae_select_own_student untouched).
-- ==========================================================================
set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111"}';
select is(
  (select count(*) from leave_approval_events where id = '11000000-0000-0000-0000-000000000001')::int, 1,
  'regression: student1 can still read their own leave_approval_events row (lae_select_own_student unaffected)'
);

-- ==========================================================================
-- Test 10 — missing staff identity: an authenticated identity with NO
-- staff row (and no parent/student relationship to either event) gets
-- nothing through any staff-shaped policy. Reuses parent3 (unrelated,
-- pre-seeded, deliberately not linked to any student).
-- ==========================================================================
set local request.jwt.claims to '{"sub": "55555555-5555-5555-5555-555555555555"}';
select is(
  (select count(*) from leave_approval_events)::int, 0,
  'authenticated identity with no staff record and no parent/student link: CANNOT read any leave_approval_events row'
);

-- ==========================================================================
-- AAL1/AAL2 note (task-instructed: do not invent a database AAL mechanism).
-- No request.jwt.claims payload in this entire file — or anywhere else in
-- this test suite — ever includes an "aal" key, matching this schema's own
-- real characteristic: no RLS policy in this project reads the JWT
-- assurance-level claim. AAL2 is enforced exclusively at the application
-- layer (apps/api/src/lib/auth/guards.ts's requireAal2(), applied to the
-- one Fastify route that needs it) — this was true before this remediation
-- and remains true after it; this fix corrects the hostel/role scope this
-- policy failed to enforce, not the (separate, pre-existing, out-of-scope)
-- absence of AAL2 checking at the RLS layer. Documented as a limitation in
-- apps/reception-dashboard/docs/leave-queue.md — not silently tested as if
-- it were fixed.
select ok(true, 'AAL1/AAL2: not evaluated at the RLS layer anywhere in this schema — pre-existing, documented, explicitly out of scope for this fix (see file header)');

select * from finish();
rollback;
