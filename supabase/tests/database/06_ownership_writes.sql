-- RLS scenario: users cannot modify records they do not own/control.
begin;
select plan(5);

set local role authenticated;

-- student1 attempts to modify student2's profile: RLS filters the target
-- row to zero, so the write silently affects nothing.
set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111"}';
update students set full_name = 'student1-tried-to-hack-student2' where id = 'c0000000-0000-0000-0000-000000000002';
reset role;
select isnt(
  (select full_name from students where id = 'c0000000-0000-0000-0000-000000000002'),
  'student1-tried-to-hack-student2',
  'student1: cannot modify student2''s profile'
);

-- student1 attempts to modify their OWN roll_number, an excluded column per
-- docs/database-schema-design.md ("student: UPDATE own row, limited columns
-- (not roll_number...)") — column-level restriction is a view/grant concern
-- for implementation time, not RLS row-filtering; this row-level policy alone
-- does not prevent it, so we test what RLS actually does: the row IS
-- reachable (owner), confirming the flagged follow-up rather than a false pass.
set local role authenticated;
set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111"}';
select ok(
  (select count(*) from students where id = 'c0000000-0000-0000-0000-000000000001') = 1,
  'student1: row-level policy allows updating own row (column-level roll_number restriction is a separate, flagged follow-up — see final report)'
);

-- parent3 (unrelated) attempts to modify student1's leave request.
set local request.jwt.claims to '{"sub": "55555555-5555-5555-5555-555555555555"}';
update leave_requests set status = 'approved' where id = '10000000-0000-0000-0000-000000000001';
reset role;
select isnt(
  (select status from leave_requests where id = '10000000-0000-0000-0000-000000000001')::text,
  'approved',
  'unrelated parent3: cannot modify student1''s leave request'
);

-- reception (Kalinga) attempts to modify a leave request for the OTHER
-- hostel's student (student2 has none, so instead prove reception cannot
-- touch trusted_devices, which is never staff-writable at all).
set local role authenticated;
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';
update trusted_devices set revoked_at = now() where id = 'f0000000-0000-0000-0000-000000000001';
reset role;
select is(
  (select revoked_at from trusted_devices where id = 'f0000000-0000-0000-0000-000000000001'),
  null,
  'reception: cannot revoke a parent''s trusted device (staff has no policy on trusted_devices)'
);

-- F-QG02-01 (QG-02 Leave Authorization Workflow Review, remediated):
-- reception (Kalinga, own-hostel, own-student) attempts to directly PATCH
-- the seeded 'father_notified' leave request straight to 'approved' via
-- RLS, bypassing DrizzleLeaveRepository.decide() entirely — the exact shape
-- of QG-02's live-reproduced Exploit Replay 2. leave_requests_update_reception
-- (packages/db/src/schema/leave.ts, supabase/migrations/
-- 0012_fqg0201_exit_authorization_workflow_state_gate.sql) now requires
-- status = 'manual_verification' in its USING clause, so a 'father_notified'
-- row is invisible to this UPDATE statement entirely: it succeeds but
-- silently affects zero rows, the same "affects nothing" RLS pattern
-- already established elsewhere in this suite (see the student2/parent3
-- cases above) rather than raising an error.
set local role authenticated;
set local request.jwt.claims to '{"sub": "66666666-6666-6666-6666-666666666666"}';
update leave_requests set status = 'approved' where id = '10000000-0000-0000-0000-000000000001';
reset role;
select isnt(
  (select status from leave_requests where id = '10000000-0000-0000-0000-000000000001')::text,
  'approved',
  'F-QG02-01: reception (Kalinga) cannot directly force a father_notified leave request to approved via RLS — only manual_verification-origin rows are UPDATE-visible'
);

select * from finish();
rollback;
