-- RLS scenario: report_templates/report_executions have ZERO policies for
-- any client role at all (Phase 6, Prompt 16 — mirrors
-- configuration_entries'/audit_logs' own established "no SELECT/INSERT/
-- UPDATE/DELETE grant exists for anon or authenticated; only Fastify's
-- service-role connection, which bypasses RLS entirely, reads/writes this
-- table" pattern exactly). Every authorization decision (role, AAL2,
-- reports:view/reports:generate permission, template ownership) is made
-- once, in apps/api/src/domain/reports/ — this suite proves no client role
-- can bypass that by going straight to PostgREST/Supabase.
begin;
select plan(10);

-- Seed one row of each table via the service-role (bypasses RLS)
-- connection, owned by the seeded super_admin, so the UPDATE/DELETE
-- scenarios below have a real target row to attempt against.
insert into report_templates (id, staff_id, report_id, name, filters, selected_fields, is_favorite)
values (
  'b1111111-1111-1111-1111-111111111111',
  'e0000000-0000-0000-0000-000000000004',
  'leave_authorization',
  'RLS test template',
  '{}'::jsonb,
  '[]'::jsonb,
  false
);
insert into report_executions (id, report_id, requested_by_staff_id, filters_summary, row_count)
values (
  'b2222222-2222-2222-2222-222222222222',
  'leave_authorization',
  'e0000000-0000-0000-0000-000000000004',
  '{}'::jsonb,
  0
);

set local role authenticated;

-- Even super_admin — the seeded OWNER of the row above and the most
-- privileged client role — sees nothing.
set local request.jwt.claims to '{"sub": "99999999-9999-9999-9999-999999999999"}';
select is(
  (select count(*) from report_templates)::int, 0,
  'super_admin (row owner): cannot SELECT report_templates (no policy grants any client access)'
);
select is(
  (select count(*) from report_executions)::int, 0,
  'super_admin: cannot SELECT report_executions either'
);

-- INSERT with no permissive policy raises an actual RLS-violation error
-- (same behavior confirmed for audit_logs/configuration_entries).
select throws_ok(
  $$ insert into report_templates (staff_id, report_id, name)
     values ('e0000000-0000-0000-0000-000000000004', 'leave_authorization', 'forged') $$,
  '42501',
  null,
  'super_admin: cannot INSERT into report_templates'
);
select throws_ok(
  $$ insert into report_executions (report_id, requested_by_staff_id, row_count)
     values ('leave_authorization', 'e0000000-0000-0000-0000-000000000004', 0) $$,
  '42501',
  null,
  'super_admin: cannot INSERT into report_executions'
);
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "99999999-9999-9999-9999-999999999999"}';
update report_templates set name = 'tampered' where id = 'b1111111-1111-1111-1111-111111111111';
reset role;
select is(
  (select name from report_templates where id = 'b1111111-1111-1111-1111-111111111111'),
  'RLS test template',
  'super_admin: cannot UPDATE report_templates, even a row it owns'
);

set local role authenticated;
set local request.jwt.claims to '{"sub": "99999999-9999-9999-9999-999999999999"}';
delete from report_templates where id = 'b1111111-1111-1111-1111-111111111111';
reset role;
select is(
  (select count(*) from report_templates where id = 'b1111111-1111-1111-1111-111111111111')::int, 1,
  'super_admin: cannot DELETE report_templates, even a row it owns'
);

-- hostel_admin (a different staff member, not the row's owner) fares no
-- better — confirms this is a blanket no-client-access rule, not merely a
-- missing "own row" grant that some other role happens to have.
set local role authenticated;
set local request.jwt.claims to '{"sub": "88888888-8888-8888-8888-888888888888"}';
select is(
  (select count(*) from report_templates)::int, 0,
  'hostel_admin (non-owner): cannot SELECT report_templates either'
);
select is(
  (select count(*) from report_executions)::int, 0,
  'hostel_admin: cannot SELECT report_executions either'
);
reset role;

-- Anonymous fares no better.
set local role anon;
select is(
  (select count(*) from report_templates)::int, 0,
  'anon: cannot SELECT report_templates either'
);
select is(
  (select count(*) from report_executions)::int, 0,
  'anon: cannot SELECT report_executions either'
);

select * from finish();
rollback;
