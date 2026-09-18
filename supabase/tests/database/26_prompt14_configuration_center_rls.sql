-- RLS scenario: configuration_entries has ZERO policies for any client role
-- at all (Phase 5, Prompt 14 — mirrors audit_logs' own established "no
-- SELECT/INSERT/UPDATE/DELETE grant exists for anon or authenticated; only
-- Fastify's service-role connection, which bypasses RLS entirely, reads/
-- writes this table" pattern exactly, per configuration.ts's own doc
-- comment). Every authorization decision (role, AAL2, hostel scope) is made
-- once, in apps/api/src/domain/configuration/ — this suite proves no client
-- role can bypass that by going straight to PostgREST/Supabase.
begin;
select plan(6);

set local role authenticated;

-- Even super_admin — the most privileged client role — sees nothing.
set local request.jwt.claims to '{"sub": "99999999-9999-9999-9999-999999999999"}';
select is(
  (select count(*) from configuration_entries)::int, 0,
  'super_admin: cannot SELECT configuration_entries (no policy grants any client access)'
);

-- INSERT with no permissive policy raises an actual RLS-violation error
-- (same behavior confirmed for audit_logs/01_anonymous_denied.sql).
select throws_ok(
  $$ insert into configuration_entries (domain, key, value, value_type, scope)
     values ('system', 'test.tamper', '"x"'::jsonb, 'string', 'global') $$,
  '42501',
  null,
  'super_admin: cannot INSERT into configuration_entries'
);
reset role;

-- Seed one row via the service-role (bypasses RLS) connection so the
-- UPDATE/DELETE scenarios below have a real target row to attempt against.
insert into configuration_entries (id, domain, key, value, value_type, scope)
values ('a1111111-1111-1111-1111-111111111111', 'system', 'test.seeded', '"unchanged"'::jsonb, 'string', 'global');

set local role authenticated;
set local request.jwt.claims to '{"sub": "99999999-9999-9999-9999-999999999999"}';
update configuration_entries set value = '"tampered"'::jsonb where key = 'test.seeded';
reset role;
select is(
  (select value from configuration_entries where key = 'test.seeded')::text, '"unchanged"',
  'super_admin: cannot UPDATE configuration_entries'
);

set local role authenticated;
set local request.jwt.claims to '{"sub": "99999999-9999-9999-9999-999999999999"}';
delete from configuration_entries where key = 'test.seeded';
reset role;
select is(
  (select count(*) from configuration_entries where key = 'test.seeded')::int, 1,
  'super_admin: cannot DELETE configuration_entries'
);

-- hostel_admin fares no better than super_admin — confirms this is a
-- blanket no-client-access rule, not merely an incomplete super_admin grant.
set local role authenticated;
set local request.jwt.claims to '{"sub": "88888888-8888-8888-8888-888888888888"}';
select is(
  (select count(*) from configuration_entries)::int, 0,
  'hostel_admin: cannot SELECT configuration_entries either'
);
reset role;

-- Anonymous fares no better.
set local role anon;
select is(
  (select count(*) from configuration_entries)::int, 0,
  'anon: cannot SELECT configuration_entries either'
);

select * from finish();
rollback;
