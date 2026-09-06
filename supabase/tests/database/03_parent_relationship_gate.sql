-- RLS scenario: parent cannot access another student's data unless the
-- relationship exists.
begin;
select plan(6);

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
-- F-08: leave_approval_events is now realtime-enabled (migration 0007);
-- Postgres Changes enforces the same RLS as ordinary SELECT, so this is
-- also the authoritative proof of the realtime authorization boundary,
-- not merely a REST-path check.
select is(
  (select count(*) from leave_approval_events where id = '11000000-0000-0000-0000-000000000001')::int, 1,
  'parent1 (linked father): can see student1''s leave_approval_events row'
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
-- F-08 IDOR check: an unauthorized actor must not be able to see (and, by
-- the same RLS the realtime layer enforces, must not receive live events
-- for) another student's approval-event history, via a known row id.
select is(
  (select count(*) from leave_approval_events where id = '11000000-0000-0000-0000-000000000001')::int, 0,
  'unrelated parent3: cannot see student1''s leave_approval_events row (known-ID IDOR check)'
);

select * from finish();
rollback;
