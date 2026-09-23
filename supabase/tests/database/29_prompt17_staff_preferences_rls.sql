-- RLS scenario: staff_preferences (Phase 7, Prompt 17 — Administrative
-- Profile & Personal Preferences Center). Exactly three self-only policies
-- (SELECT/INSERT/UPDATE), each `staff_id = public.current_staff_id()` — no
-- exception for ANY role, including super_admin, since this table holds
-- only personal workspace preferences with no administrative meaning to
-- anyone but their owner (preferences.ts's own doc comment). Proves the
-- adversarial matrix this feature's own security requirements demand:
-- self access allowed, cross-staff access denied for every role including
-- the most privileged one, ownership-field tampering denied, anon denied.
begin;
select plan(12);

-- Seed one preferences row for reception1 via the service-role (bypasses
-- RLS) connection, matching every other suite's fixture-setup convention.
insert into staff_preferences (id, staff_id, phone_number)
values (
  'f1111111-1111-1111-1111-111111111111',
  'e0000000-0000-0000-0000-000000000001', -- reception1 (auth_user 66666666...)
  '+910000000001'
);

-- === Self access: reception1 can read and update their OWN row ===
set local role authenticated;
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';
select is(
  (select phone_number from staff_preferences where staff_id = 'e0000000-0000-0000-0000-000000000001'),
  '+910000000001',
  'reception1: can SELECT own staff_preferences row'
);

update staff_preferences set phone_number = '+910000000099' where staff_id = 'e0000000-0000-0000-0000-000000000001';
select is(
  (select phone_number from staff_preferences where staff_id = 'e0000000-0000-0000-0000-000000000001'),
  '+910000000099',
  'reception1: can UPDATE own staff_preferences row'
);
reset role;

-- === reception1 can INSERT a row for themself (upsert-on-first-access
-- shape) when one does not exist yet — reception2 has none seeded above. ===
set local role authenticated;
set local request.jwt.claims to '{"sub": "dddddddd-dddd-dddd-dddd-dddddddddddd"}';
insert into staff_preferences (staff_id) values ('e0000000-0000-0000-0000-000000000006');
select is(
  (select count(*)::int from staff_preferences where staff_id = 'e0000000-0000-0000-0000-000000000006'),
  1,
  'reception2: can INSERT own staff_preferences row'
);
reset role;

-- === Ownership-field tampering: reception2 cannot INSERT a row claiming
-- to own reception1's identity (WITH CHECK denies it outright). ===
set local role authenticated;
set local request.jwt.claims to '{"sub": "dddddddd-dddd-dddd-dddd-dddddddddddd"}';
-- RLS's WITH CHECK is evaluated before the table's own unique constraint
-- for this statement shape — the caller is rejected as an authorization
-- failure (42501), never even reaching the point where a 23505 unique
-- violation could occur.
select throws_ok(
  $$ insert into staff_preferences (staff_id) values ('e0000000-0000-0000-0000-000000000001') $$,
  '42501',
  null,
  'reception2: cannot INSERT a second row for reception1 (RLS rejects the forged ownership, never reaching the unique constraint)'
);
reset role;

-- === Cross-staff SELECT denial: reception2 cannot see reception1's row. ===
set local role authenticated;
set local request.jwt.claims to '{"sub": "dddddddd-dddd-dddd-dddd-dddddddddddd"}';
select is(
  (select count(*)::int from staff_preferences where staff_id = 'e0000000-0000-0000-0000-000000000001'),
  0,
  'reception2: cannot SELECT reception1''s staff_preferences row (invisible, not merely unwritable)'
);

-- === Cross-staff UPDATE denial: affects zero rows, value unchanged. ===
update staff_preferences set phone_number = '+91HACKED' where staff_id = 'e0000000-0000-0000-0000-000000000001';
reset role;
select is(
  (select phone_number from staff_preferences where staff_id = 'e0000000-0000-0000-0000-000000000001'),
  '+910000000099',
  'reception2: cross-staff UPDATE affects zero rows, reception1''s value is unchanged'
);

-- === super_admin gets NO special access either — deliberate, no bypass
-- policy exists for this table (unlike staff/security_incidents/etc). ===
set local role authenticated;
set local request.jwt.claims to '{"sub": "99999999-9999-9999-9999-999999999999"}';
select is(
  (select count(*)::int from staff_preferences where staff_id = 'e0000000-0000-0000-0000-000000000001'),
  0,
  'super_admin: cannot SELECT another staff member''s preferences (no bypass policy exists)'
);
update staff_preferences set phone_number = '+91SUPERADMIN' where staff_id = 'e0000000-0000-0000-0000-000000000001';
select throws_ok(
  $$ insert into staff_preferences (staff_id) values ('e0000000-0000-0000-0000-000000000003') $$
  ,'42501', null,
  'super_admin: cannot INSERT a preferences row for a DIFFERENT staff member (hostel_admin)'
);
reset role;
-- Verified via the unprivileged service-role connection, not while still
-- impersonating super_admin — super_admin's own SELECT policy is
-- self-only too, so a check made under that role would see no row at all
-- and could not actually prove "unchanged" either way.
select is(
  (select phone_number from staff_preferences where staff_id = 'e0000000-0000-0000-0000-000000000001'),
  '+910000000099',
  'super_admin: cross-staff UPDATE also affects zero rows, value still unchanged'
);

-- === unrelated non-staff identity (a seeded student auth_user_id, if the
-- resolved current_staff_id() is null) gets zero rows, not an error. ===
set local role authenticated;
set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111"}';
select is(
  (select count(*)::int from staff_preferences),
  0,
  'a non-staff authenticated identity sees zero staff_preferences rows'
);
reset role;

-- === anon denied entirely. ===
set local role anon;
select is(
  (select count(*)::int from staff_preferences)::int, 0,
  'anon: cannot SELECT staff_preferences'
);
reset role;

select is(
  (select count(*)::int from staff_preferences where staff_id = 'e0000000-0000-0000-0000-000000000001'),
  1,
  'sanity: reception1''s row still exists exactly once (service-role re-read)'
);

select * from finish();
rollback;
