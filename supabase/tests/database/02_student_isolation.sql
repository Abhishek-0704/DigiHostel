-- RLS scenario: student cannot access another student's private data.
begin;
select plan(5);

-- student1 (11111111-...) reads their own row: fine.
set local role authenticated;
set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111"}';

select is(
  (select count(*) from students where id = 'c0000000-0000-0000-0000-000000000001')::int, 1,
  'student1: can see own student row'
);
select is(
  (select count(*) from students where id = 'c0000000-0000-0000-0000-000000000002')::int, 0,
  'student1: cannot see student2''s row'
);
select is(
  (select count(*) from leave_requests where student_id = 'c0000000-0000-0000-0000-000000000001')::int, 1,
  'student1: can see own leave request'
);

-- student2 has no leave_requests row linked to them in the seed, but let's
-- confirm they can't see student1's either way.
set local request.jwt.claims to '{"sub": "22222222-2222-2222-2222-222222222222"}';
select is(
  (select count(*) from leave_requests where student_id = 'c0000000-0000-0000-0000-000000000001')::int, 0,
  'student2: cannot see student1''s leave request'
);
-- F-08 IDOR check: leave_approval_events is now realtime-enabled
-- (migration 0007) — a cross-student subscriber must not receive another
-- student's approval-event history via a known row id.
select is(
  (select count(*) from leave_approval_events where id = '11000000-0000-0000-0000-000000000001')::int, 0,
  'student2: cannot see student1''s leave_approval_events row (known-ID IDOR check)'
);

select * from finish();
rollback;
