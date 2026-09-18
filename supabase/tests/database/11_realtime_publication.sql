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
select plan(9);

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

-- F-QG02-04 (QG-02 Leave Authorization Workflow Review): the exit-
-- authorization fact table had the same "event-only gap" F-08 already
-- diagnosed and fixed for leave_approval_events — see
-- 0013_fqg0204_leave_exit_authorizations_realtime.sql's own comment.
select ok(
  exists(
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'leave_exit_authorizations'
  ),
  'leave_exit_authorizations is a member of the supabase_realtime publication (F-QG02-04)'
);

-- Phase 4, Prompt 9 (Student Movement Management System / Hostel Return):
-- the Movement Engine's own fact table joins the publication directly from
-- the start (0015_movement_engine_hostel_return.sql), the same established
-- pattern as leave_approval_events/leave_exit_authorizations.
select ok(
  exists(
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'movements'
  ),
  'movements is a member of the supabase_realtime publication (Phase 4, Prompt 9)'
);

-- Phase 4, Prompt 10 (Emergency Operations Center): both tables join the
-- publication directly from the start (0017_emergency_operations_center.sql).
select ok(
  exists(
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'security_incidents'
  ),
  'security_incidents is a member of the supabase_realtime publication (Phase 4, Prompt 10)'
);
select ok(
  exists(
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'security_incident_events'
  ),
  'security_incident_events is a member of the supabase_realtime publication (Phase 4, Prompt 10)'
);

-- Phase 4, Prompt 11 (Health Operations Center): both tables join the
-- publication directly from the start (0018_health_operations_center.sql).
select ok(
  exists(
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'health_cases'
  ),
  'health_cases is a member of the supabase_realtime publication (Phase 4, Prompt 11)'
);
select ok(
  exists(
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'health_case_events'
  ),
  'health_case_events is a member of the supabase_realtime publication (Phase 4, Prompt 11)'
);

select * from finish();
rollback;
