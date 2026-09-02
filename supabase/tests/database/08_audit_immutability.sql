-- RLS scenario: audit records cannot be modified (or even read) by normal
-- clients. audit_logs has ZERO policies for any client role at all
-- (docs/rls-policy-matrix.md) — only Fastify's service-role connection,
-- which bypasses RLS entirely, touches this table.
begin;
select plan(5);

set local role authenticated;

-- Even super_admin — the most privileged client role — sees nothing.
set local request.jwt.claims to '{"sub": "99999999-9999-9999-9999-999999999999"}';
select is(
  (select count(*) from audit_logs)::int, 0,
  'super_admin: cannot SELECT audit_logs (no policy grants any client access)'
);

-- Unlike UPDATE (which silently affects zero rows when RLS filters the
-- target), INSERT with no permissive policy raises an actual RLS-violation
-- error — same behavior confirmed in 01_anonymous_denied.sql.
select throws_ok(
  $$ insert into audit_logs (actor_type, actor_id, action, entity_type, entity_id)
     values ('staff', 'e0000000-0000-0000-0000-000000000004', 'test.tamper', 'audit_logs', gen_random_uuid()) $$,
  '42501',
  null,
  'super_admin: cannot INSERT into audit_logs'
);
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "99999999-9999-9999-9999-999999999999"}';
update audit_logs set action = 'tampered' where action = 'leave.notified';
reset role;
select is(
  (select count(*) from audit_logs where action = 'tampered')::int, 0,
  'super_admin: cannot UPDATE audit_logs'
);

set local role authenticated;
set local request.jwt.claims to '{"sub": "99999999-9999-9999-9999-999999999999"}';
delete from audit_logs where action = 'leave.notified';
reset role;
select is(
  (select count(*) from audit_logs where action = 'leave.notified')::int, 1,
  'super_admin: cannot DELETE audit_logs'
);

-- Anonymous fares no better.
set local role anon;
select is(
  (select count(*) from audit_logs)::int, 0,
  'anon: cannot SELECT audit_logs either'
);

select * from finish();
rollback;
