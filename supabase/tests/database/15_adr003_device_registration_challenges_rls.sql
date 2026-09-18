-- ADR-003 implementation — RLS lockdown coverage for
-- device_registration_challenges.
--
-- This table exists purely as backend-internal challenge/nonce storage for
-- the Play Integrity/App Attest device-registration flow
-- (apps/api/src/domain/device/). It intentionally carries NO policy grants
-- for any client role at all (same pattern as audit_logs) — a client never
-- reads or writes it directly; the nonce is only ever learned via the
-- POST /devices/challenge HTTP response body, and only the backend's own
-- privileged connection (bypasses RLS by design) may write it.
--
-- This suite proves that lockdown holds for every role, mirroring
-- 12_f01_trusted_device_rls.sql's own attack-scenario structure for the
-- neighbouring trusted_devices table.

begin;
select plan(8);

-- ==========================================================================
-- Attack A — an authenticated parent attempts to read another parent's (or
-- any) challenge row directly. Expected: DENIED (no SELECT policy at all).
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "33333333-3333-3333-3333-333333333333"}'; -- parent1

select is(
  (select count(*) from device_registration_challenges)::int, 0,
  'Attack A: authenticated parent cannot SELECT any device_registration_challenges row'
);

-- ==========================================================================
-- Attack B — an authenticated parent attempts to self-issue a challenge for
-- themselves. Expected: DENIED (no INSERT policy at all).
-- ==========================================================================
select throws_ok(
  $$ insert into device_registration_challenges (parent_id, platform, nonce, expires_at)
     values ('d0000000-0000-0000-0000-000000000001', 'android', 'attacker-forged-nonce', now() + interval '5 minutes') $$,
  '42501',
  null,
  'Attack B: authenticated parent cannot self-insert a device_registration_challenges row'
);
reset role;

select is(
  (select count(*) from device_registration_challenges
     where parent_id = 'd0000000-0000-0000-0000-000000000001')::int, 0,
  'Attack B: no forged challenge row was actually created for parent1'
);

-- ==========================================================================
-- Attack C — an authenticated parent attempts to mark an (imaginary) row
-- consumed/extend its expiry to keep a stale nonce usable.
-- Expected: DENIED. Note: with zero UPDATE policies granted, Postgres RLS
-- does not raise an error here (that's the INSERT/DELETE behavior) — the
-- USING clause simply makes no row visible to the UPDATE, so it silently
-- affects zero rows. The correct assertion is therefore "the value is
-- unchanged," not throws_ok.
-- ==========================================================================
insert into device_registration_challenges (parent_id, platform, nonce, expires_at)
  values ('d0000000-0000-0000-0000-000000000001', 'android', 'backend-issued-nonce-001', now() + interval '5 minutes')
  returning id \gset fixture_

set local role authenticated;
set local request.jwt.claims to '{"sub": "33333333-3333-3333-3333-333333333333"}'; -- parent1 (owner)
update device_registration_challenges set expires_at = now() + interval '1 day' where id = :'fixture_id';
reset role;

select is(
  (select expires_at < now() + interval '1 hour' from device_registration_challenges where id = :'fixture_id'),
  true,
  'Attack C: even the owning parent''s UPDATE affects zero rows — the challenge''s expiry is unchanged'
);

-- ==========================================================================
-- Attack D — cross-parent read attempt: parent2 tries to see parent1's
-- backend-issued challenge (e.g. to steal/replay its nonce).
-- Expected: DENIED.
-- ==========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "44444444-4444-4444-4444-444444444444"}'; -- parent2

select is(
  (select count(*) from device_registration_challenges where id = :'fixture_id')::int, 0,
  'Attack D: parent2 cannot see parent1''s challenge row (nonce is not readable via the Data API by anyone)'
);
reset role;

-- ==========================================================================
-- Anonymous — cannot read, insert, or otherwise touch this table at all.
-- ==========================================================================
set local role anon;
select is(
  (select count(*) from device_registration_challenges)::int, 0,
  'Anonymous: SELECT on device_registration_challenges returns nothing'
);
select throws_ok(
  $$ insert into device_registration_challenges (parent_id, platform, nonce, expires_at)
     values ('d0000000-0000-0000-0000-000000000001', 'android', 'anon-attempt-001', now() + interval '5 minutes') $$,
  '42501',
  null,
  'Anonymous: cannot insert into device_registration_challenges'
);
reset role;

-- ==========================================================================
-- Legitimate backend path — a privileged (RLS-bypassing) connection, exactly
-- like Fastify's own service-role connection, can issue and later consume a
-- challenge. This is the ONLY path this table is ever meant to be written
-- through — proving it remains open and unaffected by the lockdown above.
-- ==========================================================================
update device_registration_challenges set consumed_at = now() where id = :'fixture_id';
select is(
  (select consumed_at from device_registration_challenges where id = :'fixture_id') is null,
  false,
  'Legitimate backend path: a privileged connection can consume a challenge it issued'
);

select * from finish();
rollback;
