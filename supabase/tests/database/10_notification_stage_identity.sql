-- Constraint scenario (not RLS): notifications.stage + the uniqueness
-- constraint on (related_leave_request_id, recipient_id, stage) are what make
-- a logical notification identity well-defined (ADR-017 §5, ADR-018 §1) — one
-- row per escalation stage per recipient per leave request, with delivery
-- attempts tracked via retry_count on that same row, not additional rows.
-- Run as the seed/superuser connection (Fastify's own service-role writer
-- path, per docs/rls-policy-matrix.md — no client role ever inserts here).
begin;
select plan(4);

-- A first logical notification for father_notified succeeds.
insert into notifications (recipient_type, recipient_id, related_leave_request_id, stage)
values ('parent', 'd0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'father_notified');
select is(
  (select count(*) from notifications
   where related_leave_request_id = '10000000-0000-0000-0000-000000000001'
     and recipient_id = 'd0000000-0000-0000-0000-000000000001'
     and stage = 'father_notified')::int, 1,
  'first logical notification for (leave_request, recipient, stage) inserts cleanly'
);

-- A duplicate (leave_request_id, recipient_id, stage) is rejected — this is
-- the invariant the notification worker's idempotent upsert relies on: a
-- retried/re-entrant job can never create a second logical notification row.
select throws_ok(
  $$ insert into notifications (recipient_type, recipient_id, related_leave_request_id, stage)
     values ('parent', 'd0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'father_notified') $$,
  '23505',
  null,
  'duplicate (leave_request_id, recipient_id, stage) is rejected by the uniqueness constraint'
);

-- The same recipient, same leave request, but a DIFFERENT stage is a
-- different logical notification — must not be blocked by the constraint
-- above (escalation advancing to mother_notified must still be able to
-- notify the same underlying parent id if relationship data ever overlaps).
insert into notifications (recipient_type, recipient_id, related_leave_request_id, stage)
values ('parent', 'd0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'mother_notified');
select is(
  (select count(*) from notifications
   where related_leave_request_id = '10000000-0000-0000-0000-000000000001'
     and recipient_id = 'd0000000-0000-0000-0000-000000000001')::int, 2,
  'same leave request + recipient, different stage: allowed as a distinct logical notification'
);

-- Two non-leave notifications (stage and related_leave_request_id both null,
-- e.g. a future library-pass notification) never conflict with each other —
-- Postgres treats each NULL as distinct under a unique index, so this
-- constraint never blocks a workflow it wasn't designed to cover.
insert into notifications (recipient_type, recipient_id, related_library_pass_id)
values ('student', 'c0000000-0000-0000-0000-000000000001', null);
insert into notifications (recipient_type, recipient_id, related_library_pass_id)
values ('student', 'c0000000-0000-0000-0000-000000000001', null);
select is(
  (select count(*) from notifications where related_leave_request_id is null and stage is null)::int, 2,
  'two null-stage/null-leave-request notifications (e.g. library-pass) never conflict with each other'
);

select * from finish();
rollback;
