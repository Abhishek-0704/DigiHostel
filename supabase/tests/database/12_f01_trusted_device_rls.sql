-- PRR Phase 13, Finding F-01 remediation — regression + security coverage.
--
-- Prior state (the vulnerability): `trusted_devices_insert_own` let any
-- authenticated parent self-insert a fully active (`revoked_at is null`)
-- `trusted_devices` row for themselves with no attestation whatsoever —
-- despite docs/rls-policy-matrix.md always documenting device creation as
-- "post-attestation, via Fastify-mediated flow, not a raw client insert."
-- This directly defeated `requireActiveTrustedDevice()`'s purpose, since
-- that guard's authorization signal is exactly "does an active row for this
-- parent exist" — a question the database itself could no longer answer
-- honestly. `trusted_devices_revoke_own` had a related, narrower gap: its
-- USING/WITH CHECK only compared `parent_id`, with no constraint on
-- `revoked_at`'s value or direction, so a parent could self-reactivate an
-- already-revoked device, or smuggle a change to an unrelated column
-- (device_fingerprint/platform/etc.) into an otherwise-legitimate revoke.
--
-- Remediation (supabase/migrations/0003_f01_trusted_devices_rls_remediation.sql):
-- the INSERT policy was removed entirely; the UPDATE policy now enforces a
-- one-way active -> revoked transition; and a BEFORE UPDATE trigger
-- (trusted_devices_revoke_only) blocks any column other than
-- revoked_at/revoked_reason from changing in that same statement.
--
-- This file proves every attack scenario from the F-01 threat model fails
-- closed, and that the legitimate paths (self-revoke, own-device reads, a
-- privileged backend-equivalent connection) still work.

begin;
select plan(17);

-- ==========================================================================
-- Baseline sanity: fixture state matches what every assertion below assumes.
-- ==========================================================================
select is(
  (select count(*) from trusted_devices where parent_id = 'd0000000-0000-0000-0000-000000000001')::int, 1,
  'sanity: parent1 (father) starts with exactly one device'
);

-- ==========================================================================
-- Attack A — the exact previously-possible exploit: an authenticated parent
-- directly INSERTs an active device for themselves via the Data API.
-- Expected: DENIED.
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "55555555-5555-5555-5555-555555555555"}'; -- parent3 (unrelated), zero devices today

select throws_ok(
  $$ insert into trusted_devices (parent_id, platform, device_fingerprint)
     values ('d0000000-0000-0000-0000-000000000003', 'android', 'attacker-self-insert-001') $$,
  '42501',
  null,
  'Attack A (regression): authenticated parent cannot self-insert an active trusted device'
);

reset role;
select is(
  (select count(*) from trusted_devices where parent_id = 'd0000000-0000-0000-0000-000000000003')::int, 0,
  'Attack A: no device row was actually created for parent3'
);

-- ==========================================================================
-- Attack B — cross-parent insertion: parent3 attempts to insert an active
-- device attributed to parent2 instead of themselves.
-- Expected: DENIED.
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "55555555-5555-5555-5555-555555555555"}';

select throws_ok(
  $$ insert into trusted_devices (parent_id, platform, device_fingerprint)
     values ('d0000000-0000-0000-0000-000000000002', 'android', 'attacker-cross-parent-001') $$,
  '42501',
  null,
  'Attack B: parent3 cannot insert an active device attributed to parent2'
);

reset role;
select is(
  (select count(*) from trusted_devices where parent_id = 'd0000000-0000-0000-0000-000000000002')::int, 1,
  'Attack B: parent2 still has only their original (revoked) device — no forged row appeared'
);

-- ==========================================================================
-- Attack C — existing-row privilege escalation: parent2's ONLY device is
-- already revoked; parent2 attempts to UPDATE it back to active.
-- Expected: DENIED (the row is not even reachable — USING requires the
-- current row to already be active).
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "44444444-4444-4444-4444-444444444444"}'; -- parent2 (mother)
update trusted_devices set revoked_at = null
  where id = 'f0000000-0000-0000-0000-000000000002';
reset role;

select is(
  (select revoked_at from trusted_devices where id = 'f0000000-0000-0000-0000-000000000002') is null,
  false,
  'Attack C: parent2 cannot self-reactivate their own already-revoked device'
);

-- ==========================================================================
-- Attack D — cross-parent update: parent1 attempts to modify parent2's
-- device row (still revoked at this point).
-- Expected: DENIED.
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "33333333-3333-3333-3333-333333333333"}'; -- parent1 (father)
update trusted_devices set revoked_reason = 'parent1-tried-to-touch-parent2-device'
  where id = 'f0000000-0000-0000-0000-000000000002';
reset role;

select isnt(
  (select revoked_reason from trusted_devices where id = 'f0000000-0000-0000-0000-000000000002'),
  'parent1-tried-to-touch-parent2-device',
  'Attack D: parent1 cannot modify parent2''s trusted-device row'
);

-- ==========================================================================
-- Attack E — forged registration metadata riding along with a legitimate
-- revoke: parent1 (still has their original ACTIVE device at this point)
-- attempts to revoke it while ALSO smuggling a device_fingerprint change
-- into the same statement.
-- Expected: DENIED (trigger rejects — RLS's own USING/WITH CHECK alone
-- would have allowed this, since it only constrains parent_id and the
-- revoked_at transition, not other columns).
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "33333333-3333-3333-3333-333333333333"}';

select throws_ok(
  $$ update trusted_devices
       set revoked_at = now(), device_fingerprint = 'attacker-forged-fingerprint'
     where id = 'f0000000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'Attack E: parent1 cannot smuggle a device_fingerprint change into a self-revoke'
);

reset role;
select is(
  (select revoked_at from trusted_devices where id = 'f0000000-0000-0000-0000-000000000001'),
  null,
  'Attack E: parent1''s device is still active — the rejected statement changed nothing'
);
select is(
  (select device_fingerprint from trusted_devices where id = 'f0000000-0000-0000-0000-000000000001'),
  'test-fingerprint-active-001',
  'Attack E: parent1''s device fingerprint is unchanged (not silently escalated)'
);

-- ==========================================================================
-- Legitimate path — parent1 revokes their OWN device, touching only
-- revoked_at/revoked_reason. Expected: ALLOWED.
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "33333333-3333-3333-3333-333333333333"}';
update trusted_devices
  set revoked_at = now(), revoked_reason = 'test: legitimate self-revocation'
  where id = 'f0000000-0000-0000-0000-000000000001';
reset role;

select is(
  (select revoked_at from trusted_devices where id = 'f0000000-0000-0000-0000-000000000001') is null,
  false,
  'Legitimate path: parent1 CAN revoke their own device via revoked_at/revoked_reason only'
);

-- ==========================================================================
-- Leave-approval dependency (Attack F) — after every attack above, prove
-- the attacker (parent3) still has zero active devices, i.e. cannot satisfy
-- requireActiveTrustedDevice()/hasActiveTrustedDevice() by anything
-- attempted through the client database path.
-- ==========================================================================
select is(
  (select count(*) from trusted_devices
     where parent_id = 'd0000000-0000-0000-0000-000000000003' and revoked_at is null)::int, 0,
  'Attack F: parent3 has zero active trusted devices after every attempted attack — the leave-approval gate cannot be satisfied by a manufactured row'
);

-- ==========================================================================
-- Isolation — a parent sees only their own devices, never another parent's.
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "33333333-3333-3333-3333-333333333333"}'; -- parent1
select is(
  (select count(*) from trusted_devices)::int, 1,
  'Isolation: parent1''s own-scoped SELECT returns exactly their own one device'
);
select is(
  (select count(*) from trusted_devices where parent_id = 'd0000000-0000-0000-0000-000000000002')::int, 0,
  'Isolation: parent1 cannot see parent2''s device row at all'
);
reset role;

-- ==========================================================================
-- Anonymous — cannot read or mutate trusted-device state.
-- ==========================================================================
set local role anon;
select is(
  (select count(*) from trusted_devices)::int, 0,
  'Anonymous: SELECT on trusted_devices returns nothing'
);
select throws_ok(
  $$ insert into trusted_devices (parent_id, platform, device_fingerprint)
     values ('d0000000-0000-0000-0000-000000000003', 'android', 'anon-attempt-001') $$,
  '42501',
  null,
  'Anonymous: cannot insert into trusted_devices'
);
reset role;

-- ==========================================================================
-- Legitimate backend/service path — a privileged connection (this test
-- transaction's own ambient role, which owns the table and is therefore not
-- subject to RLS, mirroring Fastify's service-role connection exactly as
-- seed.sql's own audit_logs comment already establishes for this test
-- suite) can still create a device row. This is the ONLY path device
-- registration may ever use once implemented — proving it remains open,
-- unaffected by this remediation.
-- ==========================================================================
insert into trusted_devices (parent_id, platform, device_fingerprint)
  values ('d0000000-0000-0000-0000-000000000003', 'ios', 'backend-mediated-registration-001');
select is(
  (select count(*) from trusted_devices
     where parent_id = 'd0000000-0000-0000-0000-000000000003' and revoked_at is null)::int, 1,
  'Legitimate backend path: a privileged (RLS-bypassing) connection can still register a device — the future attestation-gated flow is not blocked'
);

select * from finish();
rollback;
