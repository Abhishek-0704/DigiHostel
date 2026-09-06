-- Realtime scenario (not RLS): confirms leave_requests, notifications, and
-- (F-08 remediation) leave_approval_events are members of the
-- supabase_realtime publication (migrations 0002, 0007) — ADR-009's
-- Postgres Changes depends on this, and it is easy to silently regress
-- (e.g. a future `supabase db reset` from a snapshot that omits it). This
-- does not test authorization — RLS (tested elsewhere, e.g.
-- 02_student_isolation.sql, 03_parent_relationship_gate.sql) is what scopes
-- which rows a subscriber actually receives; publication membership only
-- gates whether the table is eligible for replication at all.
begin;
select plan(3);

select ok(
  exists(
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'leave_requests'
  ),
  'leave_requests is a member of the supabase_realtime publication'
);

select ok(
  exists(
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'notifications'
  ),
  'notifications is a member of the supabase_realtime publication'
);

-- F-08: the actual immutable history table must be directly realtime-
-- enabled, not merely reachable via an incidental leave_requests-coupled
-- refetch (see 0007_f08_leave_approval_events_realtime.sql's own comment
-- for the full "event-only gap" this closes).
select ok(
  exists(
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'leave_approval_events'
  ),
  'leave_approval_events is a member of the supabase_realtime publication (F-08)'
);

select * from finish();
rollback;
