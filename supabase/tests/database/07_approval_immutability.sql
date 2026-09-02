-- RLS scenario: sensitive approval records cannot be arbitrarily modified.
-- leave_approval_events is append-only by design (docs/adr/ADR-015) — no
-- UPDATE/DELETE policy exists for ANY role, including the linked parent,
-- reception, hostel_admin, or super_admin.
begin;
select plan(5);

set local role authenticated;

-- parent1 (linked father) cannot update the seeded event.
set local request.jwt.claims to '{"sub": "33333333-3333-3333-3333-333333333333"}';
update leave_approval_events set event_type = 'expired' where id = '11000000-0000-0000-0000-000000000001';
reset role;
select isnt(
  (select event_type from leave_approval_events where id = '11000000-0000-0000-0000-000000000001')::text,
  'expired',
  'linked parent: cannot UPDATE an approval event'
);

set local role authenticated;
set local request.jwt.claims to '{"sub": "33333333-3333-3333-3333-333333333333"}';
delete from leave_approval_events where id = '11000000-0000-0000-0000-000000000001';
reset role;
select is(
  (select count(*) from leave_approval_events where id = '11000000-0000-0000-0000-000000000001')::int, 1,
  'linked parent: cannot DELETE an approval event'
);

-- super_admin cannot update or delete it either — immutability is
-- unconditional, not merely role-gated.
set local role authenticated;
set local request.jwt.claims to '{"sub": "99999999-9999-9999-9999-999999999999"}';
update leave_approval_events set biometric_confirmed = true where id = '11000000-0000-0000-0000-000000000001';
reset role;
select is(
  (select biometric_confirmed from leave_approval_events where id = '11000000-0000-0000-0000-000000000001'),
  false,
  'super_admin: cannot UPDATE an approval event either — immutability is unconditional'
);

set local role authenticated;
set local request.jwt.claims to '{"sub": "99999999-9999-9999-9999-999999999999"}';
delete from leave_approval_events where id = '11000000-0000-0000-0000-000000000001';
reset role;
select is(
  (select count(*) from leave_approval_events where id = '11000000-0000-0000-0000-000000000001')::int, 1,
  'super_admin: cannot DELETE an approval event either'
);

-- Confirm INSERT (the only permitted write) still works for a valid,
-- biometric-confirmed parent response, so we know the table isn't just
-- universally broken.
set local role authenticated;
set local request.jwt.claims to '{"sub": "33333333-3333-3333-3333-333333333333"}';
insert into leave_approval_events (leave_request_id, event_type, actor_parent_id, response, biometric_confirmed)
values ('10000000-0000-0000-0000-000000000001', 'responded', 'd0000000-0000-0000-0000-000000000001', 'approved', true);
reset role;
select is(
  (select count(*) from leave_approval_events where leave_request_id = '10000000-0000-0000-0000-000000000001')::int, 2,
  'linked parent with a trusted device: valid biometric-confirmed INSERT succeeds'
);

select * from finish();
rollback;
