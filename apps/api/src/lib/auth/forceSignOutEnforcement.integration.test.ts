import { describe, it, expect, beforeAll } from "vitest";
import type { KeyLike } from "jose";
import { createClient } from "@supabase/supabase-js";
import { eq, db, staff, auditLogs } from "@digihostel/db";
import { buildApp } from "../../app.js";
import { createJwtVerifier } from "./jwt.js";
import { generateTestKeyPair, signTestJwt } from "./__fixtures__/test-jwt.js";
import { generateTotpCode } from "./__fixtures__/totp.js";

/**
 * F-QG05-03 — Force Sign-Out enforcement READ-PATH regression coverage.
 *
 * The property under test is not "does Force Sign-Out write a timestamp" —
 * `domain/staff/repository.integration.test.ts` already proves that, and
 * additionally proves `findStaffByAuthUserId()` (called directly, as a
 * function) rejects a synthetic stale `iat` integer. What was still
 * missing, and what this file adds, is proof that the property holds when
 * exercised the way a real attacker/caller actually would: a real HTTP
 * request, through the real Fastify `authenticate` preHandler, verifying a
 * genuinely Supabase-Auth-issued JWT (real JWKS fetch against a real local
 * Supabase Auth instance, real password + real TOTP AAL2 step-up), against
 * the real, unmocked `DrizzleAuthDbPort` and real PostgreSQL.
 *
 * Two tiers:
 *   1. The core end-to-end sequence (this describe block's first test) —
 *      real Supabase Auth session, real HTTP routes, real Postgres. This is
 *      the primary evidence for F-QG05-03.
 *   2. Deterministic iat/timestamp-precision boundary tests (second describe
 *      block below) — real `authenticate()` preHandler, real Postgres, but
 *      a locally-generated test JWT key pair (this repository's own
 *      established `generateTestKeyPair()`/`signTestJwt()` convention,
 *      already used by every other auth-boundary test in this codebase —
 *      see routes/staff.test.ts) so the exact iat value can be controlled
 *      down to the millisecond. These supplement, and never replace, tier 1.
 */
const RUN = Boolean(process.env.DATABASE_URL);
const REAL_SUPABASE_URL = process.env.SUPABASE_URL;
const REAL_SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const REAL_SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HAS_REAL_SUPABASE_AUTH = Boolean(
  REAL_SUPABASE_URL && REAL_SUPABASE_ANON_KEY && REAL_SUPABASE_SERVICE_ROLE_KEY,
);

// Seeded local-only accounts (supabase/seed.sql) — password is the fixed,
// publicly-documented local seed password used by every seeded account in
// this repository's own test fixtures, never a real credential.
const RECEPTION1_STAFF_ID = "e0000000-0000-0000-0000-000000000001"; // reception_warden, Kalinga
const RECEPTION1_AUTH_USER_ID = "66666666-6666-6666-6666-666666666666";
const SUPER_ADMIN_AUTH_USER_ID = "99999999-9999-9999-9999-999999999999";
const RECEPTION1_EMAIL = "reception1@example.test";
const SUPER_ADMIN_EMAIL = "superadmin1@example.test";
const SEED_PASSWORD = "test-password";

/** Removes every MFA factor for a user via the Supabase Auth ADMIN API
 * (service-role — bypasses the ordinary session-level rule that adding or
 * removing a factor normally requires the caller to already be at AAL2).
 * Used only to reset local test-account state between runs; never used
 * against staging/production. */
async function clearAllMfaFactorsViaAdmin(authUserId: string) {
  const admin = createClient(REAL_SUPABASE_URL!, REAL_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data } = await admin.auth.admin.mfa.listFactors({ userId: authUserId });
  for (const factor of data?.factors ?? []) {
    await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId: authUserId }).catch(() => {});
  }
}

async function resetInvalidation(staffId: string) {
  await db.update(staff).set({ sessionsInvalidatedBefore: null }).where(eq(staff.id, staffId));
}

/** Real password sign-in + a genuine TOTP AAL2 step-up against the local
 * Supabase Auth instance. Any pre-existing MFA factor is removed first via
 * the ADMIN API (service-role, bypasses the ordinary session-level rule
 * that both enrolling a second factor and unenrolling a verified one
 * normally require the caller to already be at AAL2 — a chicken-and-egg
 * problem an AAL1-only client session cannot resolve on its own), so every
 * run enrolls and verifies a fresh factor whose secret this run actually
 * generated and knows, keeping the test deterministic and repeatable
 * regardless of prior run history. */
async function realAal2Session(
  email: string,
  authUserId: string,
): Promise<{ accessToken: string; iatSeconds: number }> {
  await clearAllMfaFactorsViaAdmin(authUserId);

  const client = createClient(REAL_SUPABASE_URL!, REAL_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { error: pwErr } = await client.auth.signInWithPassword({ email, password: SEED_PASSWORD });
  if (pwErr)
    throw new Error(`real local Supabase Auth sign-in failed for ${email}: ${pwErr.message}`);

  const { data: enrollData, error: enrollErr } = await client.auth.mfa.enroll({
    factorType: "totp",
  });
  if (enrollErr || !enrollData)
    throw new Error(`MFA enroll failed for ${email}: ${enrollErr?.message}`);
  const code = generateTotpCode(enrollData.totp.secret);
  const { data: challengeData, error: challengeErr } = await client.auth.mfa.challenge({
    factorId: enrollData.id,
  });
  if (challengeErr || !challengeData) {
    throw new Error(`MFA challenge failed for ${email}: ${challengeErr?.message}`);
  }
  const { data: verifyData, error: verifyErr } = await client.auth.mfa.verify({
    factorId: enrollData.id,
    challengeId: challengeData.id,
    code,
  });
  if (verifyErr || !verifyData)
    throw new Error(`MFA verify failed for ${email}: ${verifyErr?.message}`);

  const accessToken = verifyData.access_token;
  const payloadJson = Buffer.from(accessToken.split(".")[1]!, "base64url").toString("utf8");
  const payload = JSON.parse(payloadJson) as { iat: number };
  return { accessToken, iatSeconds: payload.iat };
}

async function buildRealSupabaseAuthApp() {
  // No keyResolver override -> createJwtVerifier performs a genuine
  // createRemoteJWKSet fetch against REAL_SUPABASE_URL's real
  // /auth/v1/.well-known/jwks.json, identical to production, just pointed
  // at the local instance. authDbPort is intentionally left at its
  // buildApp() default (the real DrizzleAuthDbPort), so every request in
  // this test exercises the exact production findStaffByAuthUserId() query
  // against real Postgres.
  return buildApp({
    authOverrides: { jwtVerifier: createJwtVerifier({ supabaseUrl: REAL_SUPABASE_URL! }) },
  });
}

describe.skipIf(!RUN)("Force Sign-Out enforcement read path (F-QG05-03)", () => {
  describe.skipIf(!HAS_REAL_SUPABASE_AUTH)(
    "core end-to-end sequence — real Supabase Auth JWT, real HTTP routes, real Postgres",
    () => {
      it("valid session succeeds -> Force Sign-Out -> SAME JWT rejected (401) -> new session succeeds", async () => {
        await resetInvalidation(RECEPTION1_STAFF_ID);

        const target = await realAal2Session(RECEPTION1_EMAIL, RECEPTION1_AUTH_USER_ID);
        const actor = await realAal2Session(SUPER_ADMIN_EMAIL, SUPER_ADMIN_AUTH_USER_ID);
        const app = await buildRealSupabaseAuthApp();

        // STEP B — baseline: the target's real, freshly issued JWT
        // succeeds against a real protected staff route (full chain:
        // JWKS-verified JWT -> AAL2 -> role -> hostel scope -> handler).
        const before = await app.inject({
          method: "GET",
          url: "/api/v1/leave-requests/queue",
          headers: { authorization: `Bearer ${target.accessToken}` },
        });
        expect(before.statusCode).toBe(200);

        const beforeAuditRows = await db
          .select({ id: auditLogs.id })
          .from(auditLogs)
          .where(eq(auditLogs.entityId, RECEPTION1_STAFF_ID));
        const beforeAuditCount = beforeAuditRows.length;

        // STEP C — the real Force Sign-Out route, called with a
        // separate, genuinely authenticated super_admin AAL2 session.
        const signOutRes = await app.inject({
          method: "POST",
          url: `/api/v1/staff/${RECEPTION1_STAFF_ID}/force-sign-out`,
          headers: { authorization: `Bearer ${actor.accessToken}` },
        });
        expect(signOutRes.statusCode).toBe(202);

        const persisted = await db
          .select({ v: staff.sessionsInvalidatedBefore })
          .from(staff)
          .where(eq(staff.id, RECEPTION1_STAFF_ID))
          .limit(1);
        expect(persisted[0]?.v).not.toBeNull();
        // The persisted invalidation instant must be at/after the target
        // session's own iat (it was issued before Force Sign-Out ran).
        expect(persisted[0]!.v!.getTime()).toBeGreaterThanOrEqual(target.iatSeconds * 1000);

        // STEP D — the EXACT SAME access token, reused verbatim (no
        // re-login, no refresh). This is the property that actually
        // matters: it must now be rejected.
        const after = await app.inject({
          method: "GET",
          url: "/api/v1/leave-requests/queue",
          headers: { authorization: `Bearer ${target.accessToken}` },
        });
        expect(after.statusCode).toBe(401);
        expect(JSON.parse(after.payload).error.code).toBe("no_app_profile");

        // Security negative test (§17): the same stale JWT is rejected
        // through the same authenticate() chain on a second, distinct
        // protected staff endpoint too — the rejection happens at the
        // shared authentication layer, not a route-specific check.
        const afterOtherEndpoint = await app.inject({
          method: "GET",
          url: "/api/v1/audit",
          headers: { authorization: `Bearer ${target.accessToken}` },
        });
        expect(afterOtherEndpoint.statusCode).toBe(401);

        // Audit verification (§16): Force Sign-Out produced its expected
        // audit event.
        const afterAuditRows = await db
          .select({ id: auditLogs.id, action: auditLogs.action })
          .from(auditLogs)
          .where(eq(auditLogs.entityId, RECEPTION1_STAFF_ID));
        expect(afterAuditRows.length).toBe(beforeAuditCount + 1);
        expect(afterAuditRows.at(-1)?.action).toBe("staff.force_signed_out");

        await app.close();

        // JWT `iat` has whole-second precision (RFC 7519) while
        // `sessions_invalidated_before` is a real, sub-second Postgres
        // timestamp — db-port.ts's own documented fail-closed trade-off
        // means a token whose iat floors to the SAME Unix second as the
        // invalidation instant is correctly rejected even when it is
        // actually a brand-new post-invalidation session (see this
        // file's own CASE 3 above, and db-port.ts's header comment) —
        // "a rare, self-resolving-on-retry inconvenience." A real
        // password+TOTP round trip in this local/CI environment can
        // complete fast enough to land in that same second, so this
        // deterministically waits until the wall clock has moved past
        // the invalidation instant's own second before establishing the
        // new session — a bounded (<1s), real-condition wait, not an
        // arbitrary sleep, and itself a direct demonstration of the
        // documented trade-off rather than a workaround for a defect.
        const invalidationRow = await db
          .select({ v: staff.sessionsInvalidatedBefore })
          .from(staff)
          .where(eq(staff.id, RECEPTION1_STAFF_ID))
          .limit(1);
        const invalidationMs = invalidationRow[0]!.v!.getTime();
        const nextSecondBoundaryMs = (Math.floor(invalidationMs / 1000) + 1) * 1000;
        const waitMs = nextSecondBoundaryMs - Date.now();
        if (waitMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }

        // STEP E — a genuinely NEW session (fresh real password + real
        // TOTP round trip) succeeds normally afterward: Force Sign-Out
        // invalidates existing sessions, it does not lock the account.
        const newSession = await realAal2Session(RECEPTION1_EMAIL, RECEPTION1_AUTH_USER_ID);

        // Built as a SEPARATE app instance (not the same in-memory `app`
        // from above) specifically so this cannot be explained by any
        // in-process cache — a fresh app must independently re-read
        // PostgreSQL and reach the same, correct conclusion. The closest
        // safe proxy this test environment has for "persists across an
        // application restart" (§14) without literally killing/relaunching
        // the process mid-test-run.
        const app2 = await buildRealSupabaseAuthApp();
        const afterNewSession = await app2.inject({
          method: "GET",
          url: "/api/v1/leave-requests/queue",
          headers: { authorization: `Bearer ${newSession.accessToken}` },
        });
        expect(afterNewSession.statusCode).toBe(200);

        // The OLD token must still be rejected by this independently
        // built app instance too.
        const staleStillRejected = await app2.inject({
          method: "GET",
          url: "/api/v1/leave-requests/queue",
          headers: { authorization: `Bearer ${target.accessToken}` },
        });
        expect(staleStillRejected.statusCode).toBe(401);

        await app2.close();
        await resetInvalidation(RECEPTION1_STAFF_ID);
      }, 30000);
    },
  );

  describe("iat / timestamp-precision boundary regression (§7 — guards against the QG-04 fail-open truncation bug)", () => {
    // A third, otherwise-unused seeded staff row (hostel_admin, Kalinga) —
    // deliberately not reception1/superadmin1, which the end-to-end test
    // above also mutates, so these two describe blocks never contend for
    // the same row regardless of execution order.
    const HOSTEL_ADMIN1_STAFF_ID = "e0000000-0000-0000-0000-000000000003";
    const HOSTEL_ADMIN1_AUTH_USER_ID = "88888888-8888-8888-8888-888888888888";

    let privateKey: KeyLike;
    let publicKey: KeyLike;

    beforeAll(async () => {
      const pair = await generateTestKeyPair();
      privateKey = pair.privateKey;
      publicKey = pair.publicKey;
    });

    async function buildTestKeyApp() {
      // Real authenticate() preHandler, real DrizzleAuthDbPort, real
      // Postgres — only the JWT's signing key is a locally generated test
      // key pair rather than live Supabase Auth's, exactly this
      // repository's own established convention (routes/staff.test.ts,
      // lib/auth/jwt.test.ts) for deterministic auth-boundary testing.
      const jwtVerifier = createJwtVerifier(
        { supabaseUrl: "http://127.0.0.1:9999" },
        async () => publicKey,
      );
      return buildApp({ authOverrides: { jwtVerifier } });
    }

    async function setInvalidationAt(date: Date) {
      await db
        .update(staff)
        .set({ sessionsInvalidatedBefore: date })
        .where(eq(staff.id, HOSTEL_ADMIN1_STAFF_ID));
    }
    async function clearInvalidation() {
      await db
        .update(staff)
        .set({ sessionsInvalidatedBefore: null })
        .where(eq(staff.id, HOSTEL_ADMIN1_STAFF_ID));
    }

    it("CASE 1 — token iat clearly BEFORE the invalidation instant: rejected", async () => {
      await setInvalidationAt(new Date());
      const app = await buildTestKeyApp();
      const staleToken = await signTestJwt({
        sub: HOSTEL_ADMIN1_AUTH_USER_ID,
        privateKey,
        aal: "aal2",
        issuedAtSecondsAgo: 10,
      });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/leave-requests/queue",
        headers: { authorization: `Bearer ${staleToken}` },
      });
      expect(res.statusCode).toBe(401);
      await app.close();
      await clearInvalidation();
    });

    it("CASE 2 — token iat clearly AFTER the invalidation instant: accepted", async () => {
      await setInvalidationAt(new Date(Date.now() - 5000));
      const app = await buildTestKeyApp();
      const freshToken = await signTestJwt({
        sub: HOSTEL_ADMIN1_AUTH_USER_ID,
        privateKey,
        aal: "aal2",
        issuedAtSecondsAgo: 0,
      });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/leave-requests/queue",
        headers: { authorization: `Bearer ${freshToken}` },
      });
      expect(res.statusCode).toBe(200);
      await app.close();
      await clearInvalidation();
    });

    it("CASE 3 — same-second boundary: a token issued at the START of a second is rejected when invalidation lands LATER in that same second (fail-closed; regression guard for the previous whole-second-truncation bug)", async () => {
      // Sign the token FIRST, then read its own real iat back out of it
      // (rather than assuming Date.now() at test-authoring time lines up
      // exactly with signTestJwt's own internal clock read) — this keeps
      // the test deterministic even if a scheduling delay lands the two
      // calls a few milliseconds apart or across a wall-clock second
      // boundary.
      const app = await buildTestKeyApp();
      const token = await signTestJwt({
        sub: HOSTEL_ADMIN1_AUTH_USER_ID,
        privateKey,
        aal: "aal2",
        issuedAtSecondsAgo: 0,
      });
      const tokenIatSeconds = JSON.parse(
        Buffer.from(token.split(".")[1]!, "base64url").toString("utf8"),
      ).iat as number;

      // Invalidation instant: exactly 500ms into the SAME Unix second as
      // the token's own iat (iat*1000 .. iat*1000+999 is that second's
      // millisecond range). This is precisely the ambiguity window the
      // original fail-open regression mishandled: a naive fix that
      // truncated this instant down to iat*1000 would make
      // "truncated_invalidation <= iat" spuriously TRUE and incorrectly
      // ACCEPT a token that is genuinely older than the real invalidation
      // moment. The current, correct implementation compares the
      // UNTRUNCATED instant, so this must remain REJECTED.
      await setInvalidationAt(new Date(tokenIatSeconds * 1000 + 500));

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/leave-requests/queue",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(401);

      await app.close();
      await clearInvalidation();
    });
  });
});
