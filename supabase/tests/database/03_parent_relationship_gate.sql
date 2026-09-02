-- RLS scenario: parent cannot access another student's data unless the
-- relationship exists.
begin;
select plan(4);

set local role authenticated;

-- parent1 (father, linked to student1): can see student1.
set local request.jwt.claims to '{"sub": "33333333-3333-3333-3333-333333333333"}';
select is(
  (select count(*) from students where id = 'c0000000-0000-0000-0000-000000000001')::int, 1,
  'parent1 (linked father): can see student1'
);
select is(
  (select count(*) from leave_requests where student_id = 'c0000000-0000-0000-0000-000000000001')::int, 1,
  'parent1 (linked father): can see student1''s leave request'
);

-- parent3 (deliberately unrelated to anyone): cannot see student1 or student2.
set local request.jwt.claims to '{"sub": "55555555-5555-5555-5555-555555555555"}';
select is(
  (select count(*) from students where id = 'c0000000-0000-0000-0000-000000000001')::int, 0,
  'unrelated parent3: cannot see student1'
);
select is(
  (select count(*) from leave_requests)::int, 0,
  'unrelated parent3: cannot see any leave request'
);

select * from finish();
rollback;
