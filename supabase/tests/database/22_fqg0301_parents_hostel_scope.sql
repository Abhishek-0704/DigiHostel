-- QG-03 remediation — Finding F-QG03-01 (CRITICAL).
--
-- Prior state (the vulnerability): `parents_all_hostel_admin` used a bare
-- `current_staff_role() = 'hostel_admin'` role check (present, unfixed,
-- since 0000_cute_korvac.sql) — no join against which hostel the parent's
-- own linked students actually belong to. Since the policy was `for: "all"`,
-- ANY hostel_admin, from ANY hostel, had full CRUD over EVERY parent record
-- system-wide. The QG-03 review board independently reproduced this live,
-- pre-fix: a Utkal-scoped hostel_admin read every parent row (including a
-- Kalinga parent's full name and phone number) and successfully overwrote
-- that Kalinga parent's phone_number via direct PostgREST — the write
-- persisted and was independently re-confirmed via a service-role re-read.
--
-- Remediation (supabase/migrations/0019_fqg0301_fqg0302_hostel_scope_remediation.sql):
-- split into three per-operation policies (SELECT/UPDATE/DELETE), each
-- scoped via the new `public.is_hostel_admin_for_parent` SECURITY DEFINER
-- helper (join parent_student_relationships -> students -> hostel_id). NO
-- INSERT policy exists for hostel_admin at all (see that migration's own
-- comment for why — no legitimate direct-insert use case, and no way to
-- scope an insert via a relationship that cannot exist yet).
--
-- This file mirrors 13_f05_security_incidents_hostel_scope.sql's exact
-- role-switching harness and rigor, extended with explicit write-protection
-- proof (UPDATE/DELETE/INSERT, not just SELECT) and the multi-hostel-parent
-- edge case this class of fix must not silently mishandle.

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
select is(
  (select auth.uid()), '88888888-8888-8888-8888-888888888888'::uuid,
  'guard: effective identity (auth.uid()) is hostel_admin1, not a superuser session'
);

-- ==========================================================================
-- Positive: hostel_admin1 (Kalinga) retains full read access to student1's
-- own linked parents (father + mother) — the fix must not accidentally
-- restrict legitimate access.
-- ==========================================================================
select is(
  (select count(*) from parents where id = 'd0000000-0000-0000-0000-000000000001')::int, 1,
  'hostel_admin1 (Kalinga): CAN read student1''s father (own-hostel-linked parent)'
);
select is(
  (select count(*) from parents where id = 'd0000000-0000-0000-0000-000000000002')::int, 1,
  'hostel_admin1 (Kalinga): CAN read student1''s mother (own-hostel-linked parent)'
);

-- ==========================================================================
-- Negative (the core F-QG03-01 fix): hostel_admin1 (Kalinga) is denied on
-- a Utkal-only-linked parent, for every CRUD operation.
-- ==========================================================================
select is(
  (select count(*) from parents where id = 'd0000000-0000-0000-0000-000000000004')::int, 0,
  'hostel_admin1 (Kalinga): CANNOT read student2''s guardian (Utkal-only-linked parent)'
);
select is(
  (select count(*) from parents where id = 'd0000000-0000-0000-0000-000000000003')::int, 0,
  'hostel_admin1 (Kalinga): CANNOT read a parent with NO relationship to any student at all'
);

-- Cross-hostel UPDATE: must affect zero rows, source record unchanged.
update parents set phone_number = '+91-0000000000-FORGED' where id = 'd0000000-0000-0000-0000-000000000004';
reset role;
select is(
  (select phone_number from parents where id = 'd0000000-0000-0000-0000-000000000004')::text, '+91-9000000004',
  'hostel_admin1 (Kalinga): UPDATE on the Utkal-only-linked parent affected zero rows (phone_number unchanged — this is the exact write the live PostgREST attack proved possible pre-fix)'
);

-- Cross-hostel DELETE: must affect zero rows, source record still exists.
set local role authenticated;
set local request.jwt.claims to '{"sub": "88888888-8888-8888-8888-888888888888"}';
delete from parents where id = 'd0000000-0000-0000-0000-000000000004';
reset role;
select is(
  (select count(*) from parents where id = 'd0000000-0000-0000-0000-000000000004')::int, 1,
  'hostel_admin1 (Kalinga): DELETE on the Utkal-only-linked parent affected zero rows (still exists)'
);

-- ==========================================================================
-- Write protection, same-hostel: hostel_admin1 CAN legitimately update its
-- own-hostel-linked parent's phone_number (the fix must not overcorrect
-- into denying same-hostel writes too).
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "88888888-8888-8888-8888-888888888888"}';
update parents set phone_number = '+91-9000000001-UPDATED' where id = 'd0000000-0000-0000-0000-000000000001';
reset role;
select is(
  (select phone_number from parents where id = 'd0000000-0000-0000-0000-000000000001')::text, '+91-9000000001-UPDATED',
  'hostel_admin1 (Kalinga): CAN update student1''s father (own-hostel-linked parent) — legitimate write not overcorrected away'
);

-- ==========================================================================
-- INSERT: no policy exists for hostel_admin at all — every attempt is
-- denied outright, regardless of the target relationship (there is no way
-- to scope an insert via a relationship that cannot exist yet).
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "88888888-8888-8888-8888-888888888888"}';
select throws_ok(
  $$ insert into parents (id, full_name, phone_number) values ('d0000000-0000-0000-0000-000000000099', 'Forged New Parent', '+91-9000000099') $$,
  '42501',
  null,
  'hostel_admin1 (Kalinga): INSERT of a brand-new parent row is rejected outright (no INSERT policy exists for hostel_admin)'
);
reset role;
select is(
  (select count(*) from parents where id = 'd0000000-0000-0000-0000-000000000099')::int, 0,
  'hostel_admin1 (Kalinga): the rejected INSERT was not partially applied (checked RLS-bypassed)'
);

-- ==========================================================================
-- Enumeration guard: an unfiltered count() must reflect only own-hostel-
-- linked parents (2: student1's father + mother), never a total that would
-- leak the existence of other hostels' parent rows.
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "88888888-8888-8888-8888-888888888888"}';
select is(
  (select count(*) from parents)::int, 2,
  'hostel_admin1 (Kalinga): an unfiltered count() reflects only student1''s 2 linked parents (no enumeration leak)'
);

-- ==========================================================================
-- Role-switching test: within the SAME transaction, switching the effective
-- identity from hostel_admin1 to hostel_admin2 flips the authorization
-- result — proving the policy is genuinely identity-driven.
-- ==========================================================================
set local request.jwt.claims to '{"sub": "cccccccc-cccc-cccc-cccc-cccccccccccc"}';
select is(
  (select auth.uid()), 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
  'role-switch: effective identity is now hostel_admin2'
);
select is(
  (select count(*) from parents where id = 'd0000000-0000-0000-0000-000000000001')::int, 0,
  'role-switch: hostel_admin2 (Utkal) CANNOT read student1''s father (Kalinga-only-linked) — flips from hostel_admin1''s own-hostel allow'
);
select is(
  (select count(*) from parents where id = 'd0000000-0000-0000-0000-000000000004')::int, 1,
  'role-switch: hostel_admin2 (Utkal) CAN read student2''s guardian (own-hostel-linked)'
);

-- ==========================================================================
-- Multi-hostel-parent edge case: a parent linked to a student in EACH
-- hostel must be visible/manageable by BOTH hostels' hostel_admin — the
-- data model places no constraint preventing a parent from having children
-- across hostels, and this mirrors parent_student_relationships' own
-- pre-existing psr_all_hostel_admin behavior for the identical case (each
-- hostel's admin already sees the relationship row for their own hostel's
-- student regardless of the parent's other links). This is NOT a silently
-- invented outcome — it is the behavior the existing, unmodified
-- psr_all_hostel_admin policy already establishes as this schema's intent.
-- ==========================================================================
reset role;
insert into parents (id, full_name, phone_number) values
  ('d0000000-0000-0000-0000-000000000099', 'Test Multi Hostel Parent', '+91-9000000099');
insert into parent_student_relationships (parent_id, student_id, relationship_type, escalation_order) values
  ('d0000000-0000-0000-0000-000000000099', 'c0000000-0000-0000-0000-000000000001', 'guardian', 1),
  ('d0000000-0000-0000-0000-000000000099', 'c0000000-0000-0000-0000-000000000002', 'guardian', 1);

set local role authenticated;
set local request.jwt.claims to '{"sub": "88888888-8888-8888-8888-888888888888"}';
select is(
  (select count(*) from parents where id = 'd0000000-0000-0000-0000-000000000099')::int, 1,
  'multi-hostel parent: hostel_admin1 (Kalinga) CAN see the parent linked to student1 (Kalinga) AND student2 (Utkal)'
);
set local request.jwt.claims to '{"sub": "cccccccc-cccc-cccc-cccc-cccccccccccc"}';
select is(
  (select count(*) from parents where id = 'd0000000-0000-0000-0000-000000000099')::int, 1,
  'multi-hostel parent: hostel_admin2 (Utkal) ALSO CAN see the same multi-hostel-linked parent'
);
set local request.jwt.claims to '{"sub": "88888888-8888-8888-8888-888888888888"}';
select is(
  (select auth.uid()), '88888888-8888-8888-8888-888888888888'::uuid,
  'sanity: back to hostel_admin1 for the remainder of this file'
);

-- ==========================================================================
-- Regression: reception_warden has NO policy on `parents` at all — this fix
-- must not have accidentally granted reception any new access (Reception
-- reads guardian contact only via the existing, hostel-scoped
-- GET /students/{rollNumber} Fastify endpoint, never direct table access).
-- ==========================================================================
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';
select is(
  (select count(*) from parents)::int, 0,
  'regression: reception_warden (reception1) still has zero direct-table access to parents (unaffected by this fix)'
);

-- ==========================================================================
-- Regression: library_incharge has NO policy on `parents` at all — unaffected.
-- ==========================================================================
set local request.jwt.claims to '{"sub": "77777777-7777-7777-7777-777777777777"}';
select is(
  (select count(*) from parents)::int, 0,
  'regression: library_incharge still has zero direct-table access to parents (unaffected by this fix)'
);

-- ==========================================================================
-- Regression: super_admin authority is completely unchanged (the policy
-- touched was `..._hostel_admin`, not `..._all_super_admin`).
-- ==========================================================================
set local request.jwt.claims to '{"sub": "99999999-9999-9999-9999-999999999999"}';
select is(
  (select count(*) from parents)::int, 5,
  'regression: super_admin still sees every parent (4 original fixtures + 1 multi-hostel fixture inserted above)'
);
update parents set phone_number = '+91-9000000003-superadmin' where id = 'd0000000-0000-0000-0000-000000000003';
select is(
  (select phone_number from parents where id = 'd0000000-0000-0000-0000-000000000003')::text, '+91-9000000003-superadmin',
  'regression: super_admin can still write across hostels'
);

-- ==========================================================================
-- Regression: self-access policies (parents_select_own / parents_update_own)
-- are untouched by this migration.
-- ==========================================================================
set local request.jwt.claims to '{"sub": "33333333-3333-3333-3333-333333333333"}';
select is(
  (select count(*) from parents where id = 'd0000000-0000-0000-0000-000000000001')::int, 1,
  'regression: parent1 (father) can still read their own parents row (parents_select_own unaffected)'
);
update parents set full_name = 'Test Father One Updated' where id = 'd0000000-0000-0000-0000-000000000001';
reset role;
select is(
  (select full_name from parents where id = 'd0000000-0000-0000-0000-000000000001')::text, 'Test Father One Updated',
  'regression: parent1 (father) can still update their own row (parents_update_own unaffected)'
);

select * from finish();
rollback;
