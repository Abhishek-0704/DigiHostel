-- RLS scenario: anonymous cannot access protected data.
begin;
select plan(6);

set local role anon;

select is(
  (select count(*) from students)::int, 0,
  'anon: students SELECT returns zero rows'
);
select is(
  (select count(*) from parents)::int, 0,
  'anon: parents SELECT returns zero rows'
);
select is(
  (select count(*) from leave_requests)::int, 0,
  'anon: leave_requests SELECT returns zero rows'
);
select is(
  (select count(*) from audit_logs)::int, 0,
  'anon: audit_logs SELECT returns zero rows'
);
select throws_ok(
  $$ insert into leave_requests (student_id, reason, start_date, end_date)
     values ('c0000000-0000-0000-0000-000000000001', 'anon attempt', '2026-11-01', '2026-11-02') $$,
  '42501',
  null,
  'anon: leave_requests INSERT is rejected'
);
-- RLS silently filters UPDATE targets rather than raising (no anon policy
-- grants any row visibility, so zero rows match and zero rows change) —
-- assert the real row is untouched. The verification SELECT must run as a
-- privileged role, since anon can't read students at all to check either.
update students set full_name = 'hacked-by-anon-test' where id = 'c0000000-0000-0000-0000-000000000001';
reset role;
select isnt(
  (select full_name from students where id = 'c0000000-0000-0000-0000-000000000001'),
  'hacked-by-anon-test',
  'anon: students UPDATE has no effect (zero rows matched under RLS)'
);

select * from finish();
rollback;
