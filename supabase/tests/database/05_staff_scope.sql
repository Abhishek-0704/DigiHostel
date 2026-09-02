-- RLS scenario: staff access follows role/scope.
begin;
select plan(6);

set local role authenticated;

-- reception1 is scoped to Kalinga (student1's hostel) — sees student1, not student2.
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';
select is(
  (select count(*) from students where id = 'c0000000-0000-0000-0000-000000000001')::int, 1,
  'reception (Kalinga): can see own-hostel student1'
);
select is(
  (select count(*) from students where id = 'c0000000-0000-0000-0000-000000000002')::int, 0,
  'reception (Kalinga): cannot see other-hostel student2'
);

-- library_incharge is not hostel-scoped — sees both.
set local request.jwt.claims to '{"sub": "77777777-7777-7777-7777-777777777777"}';
select is(
  (select count(*) from students)::int, 2,
  'library_incharge: sees all students regardless of hostel'
);

-- hostel_admin1 is scoped to Kalinga — same as reception.
set local request.jwt.claims to '{"sub": "88888888-8888-8888-8888-888888888888"}';
select is(
  (select count(*) from students where id = 'c0000000-0000-0000-0000-000000000001')::int, 1,
  'hostel_admin (Kalinga): can see own-hostel student1'
);
select is(
  (select count(*) from students where id = 'c0000000-0000-0000-0000-000000000002')::int, 0,
  'hostel_admin (Kalinga): cannot see other-hostel student2'
);

-- super_admin sees everything.
set local request.jwt.claims to '{"sub": "99999999-9999-9999-9999-999999999999"}';
select is(
  (select count(*) from students)::int, 2,
  'super_admin: sees all students'
);

select * from finish();
rollback;
