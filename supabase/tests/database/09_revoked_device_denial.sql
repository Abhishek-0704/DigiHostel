-- RLS scenario: revoked devices cannot perform protected operations.
-- parent2 (mother, linked to student1) has ONLY a revoked trusted device in
-- the seed data — a biometric-confirmed approval response must be rejected
-- at the database layer even though parent2's JWT session is otherwise
-- perfectly valid (the residual-access-token-window case ADR-014 flags).
begin;
select plan(3);

set local role authenticated;
set local request.jwt.claims to '{"sub": "44444444-4444-4444-4444-444444444444"}';

-- Sanity: parent2 really is linked (relationship exists), so a failure below
-- is specifically about device trust, not the relationship gate.
select is(
  (select count(*) from parent_student_relationships
    where parent_id = 'd0000000-0000-0000-0000-000000000002'
      and student_id = 'c0000000-0000-0000-0000-000000000001')::int, 1,
  'sanity: parent2 (mother) is genuinely linked to student1'
);

select throws_ok(
  $$ insert into leave_approval_events
       (leave_request_id, event_type, actor_parent_id, response, biometric_confirmed)
     values
       ('10000000-0000-0000-0000-000000000001', 'responded', 'd0000000-0000-0000-0000-000000000002', 'approved', true) $$,
  '42501',
  null,
  'parent2 (all devices revoked): biometric-confirmed approval INSERT is rejected'
);

select is(
  (select count(*) from leave_approval_events where actor_parent_id = 'd0000000-0000-0000-0000-000000000002')::int, 0,
  'parent2 (all devices revoked): no approval event was actually recorded'
);

select * from finish();
rollback;
