-- F-QG03-09 remediation (CRITICAL) — independent QG-03 re-verification.
--
-- Prior state (the vulnerability): `psr_all_hostel_admin` was a `for: "all"`
-- policy on `parent_student_relationships`, scoped only by the student side
-- (`isHostelAdminForStudent`), with NO validation of the parent side. A
-- Kalinga hostel_admin could INSERT a fabricated relationship linking ANY
-- existing parent (no legitimate connection to Kalinga at all) to one of
-- their own students, then use that fabricated row to satisfy `parents`'
-- `isHostelAdminForParent` check and read/write that parent's PII — live-
-- reproduced by the independent QG-03 re-verification board, reinstating the
-- exact cross-hostel PII read+write impact F-QG03-01 was remediated to
-- eliminate.
--
-- Remediation (supabase/migrations/0020_fqg0309_psr_hostel_admin_write_lockdown.sql):
-- hostel_admin's write authority (INSERT/UPDATE/DELETE) on this table is
-- removed entirely — exhaustive repository search found no legitimate
-- product workflow that writes to it. Only the pre-existing, correctly-
-- scoped SELECT remains, renamed to `psr_select_hostel_admin`.
--
-- This file exercises the full adversarial matrix required by the F-QG03-09
-- remediation task: the exact original exploit (A), ownership-mutation via
-- UPDATE on both parent_id and student_id (G, H), DELETE (I), the downstream
-- SELECT/UPDATE-on-`parents`-via-forged-relationship chain (E, F), duplicate/
-- cross-host combinations (C, D, J), multi-hostel-parent regression (K), and
-- the original F-QG03-01 direct-attack regression (L) — proving BOTH the
-- direct bypass (hostel_admin -> foreign parent) and the indirect bypass
-- (hostel_admin -> forged relationship -> foreign parent) remain blocked
-- together, not just individually.

begin;
select plan(22);

-- ==========================================================================
-- Non-privileged-session guard.
-- ==========================================================================
select isnt(
  current_setting('is_superuser'), 'on',
  'guard: the outer connection is a superuser (expected — proves the SET ROLE below is a genuine privilege drop, not a no-op)'
);

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub": "88888888-8888-8888-8888-888888888888"}';
select is(
  (select auth.uid()), '88888888-8888-8888-8888-888888888888'::uuid,
  'guard: effective identity (auth.uid()) is hostel_admin1 (Kalinga), not a superuser session'
);

-- ==========================================================================
-- A. THE EXACT EXPLOIT: foreign parent -> own-host student INSERT.
-- Test Unrelated Parent (d0000000-...-000003) has NO relationship to any
-- Kalinga student. hostel_admin1 attempts to fabricate one via student1
-- (Kalinga, own hostel — a student the admin IS legitimately scoped to).
-- ==========================================================================
select throws_ok(
  $$ insert into parent_student_relationships (parent_id, student_id, relationship_type, escalation_order)
     values ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'guardian', 9) $$,
  '42501',
  null,
  'A. hostel_admin1 (Kalinga): CANNOT fabricate a relationship linking an unrelated parent to its own-hostel student (the exact F-QG03-09 exploit) — denied outright, no INSERT policy exists'
);
reset role;
select is(
  (select count(*) from parent_student_relationships where parent_id = 'd0000000-0000-0000-0000-000000000003')::int, 0,
  'A. verify: the forged relationship was not partially applied (checked RLS-bypassed)'
);

-- ==========================================================================
-- B. Legitimate existing relationship: hostel_admin1's read access to a
-- genuinely pre-existing, legitimate own-hostel relationship must remain
-- functional (no over-correction). No legitimate WRITE workflow exists for
-- this role today (confirmed by reconnaissance), so only SELECT is checked.
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "88888888-8888-8888-8888-888888888888"}';
select is(
  (select relationship_type::text from parent_student_relationships
   where parent_id = 'd0000000-0000-0000-0000-000000000001' and student_id = 'c0000000-0000-0000-0000-000000000001'),
  'father',
  'B. hostel_admin1 (Kalinga): CAN still read student1''s legitimate father relationship (own-hostel, unaffected by the write lockdown)'
);

-- ==========================================================================
-- C. Foreign parent -> foreign student (double-cross-hostel INSERT attempt).
-- ==========================================================================
select throws_ok(
  $$ insert into parent_student_relationships (parent_id, student_id, relationship_type, escalation_order)
     values ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'guardian', 9) $$,
  '42501',
  null,
  'C. hostel_admin1 (Kalinga): CANNOT insert a relationship for a foreign parent AND a foreign (Utkal) student'
);

-- ==========================================================================
-- D. Own legitimate parent -> foreign student (re-pointing a legitimately-
-- known parent onto a student outside the admin's hostel).
-- ==========================================================================
select throws_ok(
  $$ insert into parent_student_relationships (parent_id, student_id, relationship_type, escalation_order)
     values ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'guardian', 9) $$,
  '42501',
  null,
  'D. hostel_admin1 (Kalinga): CANNOT insert a relationship for its own-hostel-linked parent against a foreign (Utkal) student'
);

-- ==========================================================================
-- E + F. Downstream chain: even attempting the forged INSERT (which fails),
-- confirm the foreign parent remains fully unreadable/unwritable via
-- `parents` (proving F-QG03-01's own fix is unaffected by, and independent
-- of, this new lockdown — the two protections are complementary, not
-- redundant with each other).
-- ==========================================================================
select is(
  (select count(*) from parents where id = 'd0000000-0000-0000-0000-000000000003')::int, 0,
  'E. hostel_admin1 (Kalinga): the unrelated parent remains unreadable via `parents` (no forged relationship was ever created to activate isHostelAdminForParent)'
);
update parents set phone_number = '+91-FORGED-VIA-BLOCKED-CHAIN' where id = 'd0000000-0000-0000-0000-000000000003';
reset role;
select is(
  (select phone_number from parents where id = 'd0000000-0000-0000-0000-000000000003')::text, '+91-9000000003',
  'F. hostel_admin1 (Kalinga): UPDATE on the unrelated parent affected zero rows (phone_number unchanged) — the downstream write chain is fully broken, not just the INSERT step'
);

-- ==========================================================================
-- G. UPDATE parent_id: attempt to mutate a LEGITIMATE, own-hostel-scoped
-- relationship so its parent_id points at a foreign/unrelated parent.
-- ==========================================================================
-- Note: with zero applicable UPDATE policies for this role, Postgres RLS
-- does NOT raise an exception (that is INSERT/WITH-CHECK-violation-specific
-- behavior) — the row set visible for UPDATE is simply empty, so the
-- statement succeeds but affects zero rows, exactly like `parents`' own
-- cross-hostel UPDATE test (22_fqg0301_...sql). Verified via a service-role
-- re-read, not via throws_ok.
set local role authenticated;
set local request.jwt.claims to '{"sub": "88888888-8888-8888-8888-888888888888"}';
update parent_student_relationships set parent_id = 'd0000000-0000-0000-0000-000000000003'
  where parent_id = 'd0000000-0000-0000-0000-000000000001' and student_id = 'c0000000-0000-0000-0000-000000000001';
reset role;
select is(
  (select parent_id from parent_student_relationships
   where parent_id = 'd0000000-0000-0000-0000-000000000001' and student_id = 'c0000000-0000-0000-0000-000000000001')::text,
  'd0000000-0000-0000-0000-000000000001',
  'G. hostel_admin1 (Kalinga): UPDATE mutating an existing relationship''s parent_id to a foreign parent affects zero rows (parent_id unchanged) — no UPDATE authority at all'
);

-- ==========================================================================
-- H. UPDATE student_id: attempt to mutate a legitimate relationship so its
-- student_id moves across the hostel boundary.
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "88888888-8888-8888-8888-888888888888"}';
update parent_student_relationships set student_id = 'c0000000-0000-0000-0000-000000000002'
  where parent_id = 'd0000000-0000-0000-0000-000000000001' and student_id = 'c0000000-0000-0000-0000-000000000001';
reset role;
select is(
  (select student_id from parent_student_relationships
   where parent_id = 'd0000000-0000-0000-0000-000000000001')::text,
  'c0000000-0000-0000-0000-000000000001',
  'H. hostel_admin1 (Kalinga): UPDATE mutating an existing relationship''s student_id to a foreign (Utkal) student affects zero rows (student_id unchanged) — no UPDATE authority at all'
);

-- ==========================================================================
-- I. DELETE: no legitimate deletion workflow exists for hostel_admin either
-- (confirmed by reconnaissance) — same-host, cross-host, and a
-- (necessarily-failed) forged-relationship deletion must all be denied.
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "88888888-8888-8888-8888-888888888888"}';
delete from parent_student_relationships
  where parent_id = 'd0000000-0000-0000-0000-000000000001' and student_id = 'c0000000-0000-0000-0000-000000000001';
delete from parent_student_relationships
  where parent_id = 'd0000000-0000-0000-0000-000000000004' and student_id = 'c0000000-0000-0000-0000-000000000002';
reset role;
select is(
  (select count(*) from parent_student_relationships
   where parent_id = 'd0000000-0000-0000-0000-000000000001' and student_id = 'c0000000-0000-0000-0000-000000000001')::int, 1,
  'I. hostel_admin1 (Kalinga): DELETE of its own-hostel legitimate relationship affected zero rows (row still exists) — no DELETE authority at all'
);
select is(
  (select count(*) from parent_student_relationships
   where parent_id = 'd0000000-0000-0000-0000-000000000004' and student_id = 'c0000000-0000-0000-0000-000000000002')::int, 1,
  'I. hostel_admin1 (Kalinga): DELETE of a cross-hostel (Utkal) relationship affected zero rows (row still exists)'
);

-- ==========================================================================
-- J. Duplicate relationship: with no INSERT authority at all, even a
-- duplicate of an already-existing legitimate pair is denied by RLS before
-- the unique constraint is ever reached.
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "88888888-8888-8888-8888-888888888888"}';
select throws_ok(
  $$ insert into parent_student_relationships (parent_id, student_id, relationship_type, escalation_order)
     values ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'father', 1) $$,
  '42501',
  null,
  'J. hostel_admin1 (Kalinga): a duplicate-of-legitimate INSERT is denied by RLS (no INSERT authority), independent of the underlying unique constraint'
);

-- ==========================================================================
-- K. Multi-hostel-parent regression: a parent legitimately linked to
-- students in BOTH hostels must remain readable by BOTH hostels' admins —
-- this write lockdown must not collapse that pre-existing, still-authoritative
-- design into a single-host assumption. Fixture inserted via service-role
-- (the only legitimate write path for this table, per this remediation).
-- ==========================================================================
reset role;
insert into parents (id, full_name, phone_number) values
  ('d0000000-0000-0000-0000-000000000098', 'F-QG03-09 Regression Multi Hostel Parent', '+91-8100000000');
insert into parent_student_relationships (parent_id, student_id, relationship_type, escalation_order) values
  ('d0000000-0000-0000-0000-000000000098', 'c0000000-0000-0000-0000-000000000001', 'guardian', 1),
  ('d0000000-0000-0000-0000-000000000098', 'c0000000-0000-0000-0000-000000000002', 'guardian', 1);

set local role authenticated;
set local request.jwt.claims to '{"sub": "88888888-8888-8888-8888-888888888888"}';
select is(
  (select count(*) from parent_student_relationships where parent_id = 'd0000000-0000-0000-0000-000000000098')::int, 1,
  'K. multi-hostel parent: hostel_admin1 (Kalinga) CAN still read the relationship row for its own-hostel student (SELECT unaffected by the write lockdown)'
);
select is(
  (select count(*) from parents where id = 'd0000000-0000-0000-0000-000000000098')::int, 1,
  'K. multi-hostel parent: hostel_admin1 (Kalinga) CAN still read the parent itself via the legitimate (service-role-created) relationship'
);
set local request.jwt.claims to '{"sub": "cccccccc-cccc-cccc-cccc-cccccccccccc"}';
select is(
  (select count(*) from parent_student_relationships where parent_id = 'd0000000-0000-0000-0000-000000000098')::int, 1,
  'K. multi-hostel parent: hostel_admin2 (Utkal) ALSO CAN still read the relationship row for its own-hostel student'
);
select is(
  (select count(*) from parents where id = 'd0000000-0000-0000-0000-000000000098')::int, 1,
  'K. multi-hostel parent: hostel_admin2 (Utkal) ALSO CAN still read the parent itself'
);

-- ==========================================================================
-- L. Original F-QG03-01 direct-attack regression: the 0019 fix on `parents`
-- itself must remain fully intact after this new migration — the direct
-- bypass (hostel_admin -> foreign parent) and the indirect bypass
-- (hostel_admin -> forged relationship -> foreign parent) are BOTH now
-- required to be blocked, not just one of them.
-- ==========================================================================
set local request.jwt.claims to '{"sub": "88888888-8888-8888-8888-888888888888"}';
select is(
  (select count(*) from parents where id = 'd0000000-0000-0000-0000-000000000004')::int, 0,
  'L. hostel_admin1 (Kalinga): direct SELECT of the Utkal-only-linked guardian remains denied (F-QG03-01 fix intact)'
);
update parents set phone_number = '+91-L-REGRESSION-FORGED' where id = 'd0000000-0000-0000-0000-000000000004';
reset role;
select is(
  (select phone_number from parents where id = 'd0000000-0000-0000-0000-000000000004')::text, '+91-9000000004',
  'L. hostel_admin1 (Kalinga): direct UPDATE of the Utkal-only-linked guardian remains denied, zero rows affected (F-QG03-01 fix intact)'
);
set local role authenticated;
set local request.jwt.claims to '{"sub": "88888888-8888-8888-8888-888888888888"}';
delete from parents where id = 'd0000000-0000-0000-0000-000000000004';
reset role;
select is(
  (select count(*) from parents where id = 'd0000000-0000-0000-0000-000000000004')::int, 1,
  'L. hostel_admin1 (Kalinga): direct DELETE of the Utkal-only-linked guardian remains denied, row still exists (F-QG03-01 fix intact)'
);

-- ==========================================================================
-- Regression: super_admin's unrestricted authority on this table is
-- completely unchanged (the policy touched was `..._hostel_admin`, not
-- `..._all_super_admin`).
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "99999999-9999-9999-9999-999999999999"}';
select lives_ok(
  $$ insert into parent_student_relationships (parent_id, student_id, relationship_type, escalation_order)
     values ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'guardian', 5) $$,
  'regression: super_admin retains full write authority on parent_student_relationships (unaffected by this fix)'
);
reset role;
delete from parent_student_relationships where parent_id = 'd0000000-0000-0000-0000-000000000003';

select * from finish();
rollback;
