import { describe, it, expect, beforeAll } from "vitest";
import { buildApp } from "../app.js";
import { FakeEligibilityRepository } from "../domain/auth/__fixtures__/fake-eligibility-repository.js";
import { FakeOtpSender } from "../domain/auth/__fixtures__/fake-otp-sender.js";
import { FakeStaffRepository } from "../domain/staff/__fixtures__/fake-repository.js";
import { InMemoryOtpChallengeStore } from "../domain/auth/otpChallengeStore.js";
import { createJwtVerifier } from "../lib/auth/jwt.js";
import { generateTestKeyPair, signTestJwt } from "../lib/auth/__fixtures__/test-jwt.js";
import { FakeAuthDbPort } from "../lib/auth/__fixtures__/fake-db-port.js";
import type { KeyLike } from "jose";

const SESSION = { accessToken: "access-tok", refreshToken: "refresh-tok" };

async function buildTestApp() {
  const eligibilityRepository = new FakeEligibilityRepository();
  const otpSender = new FakeOtpSender();
  const challengeStore = new InMemoryOtpChallengeStore();
  const app = await buildApp({
    // These routes never call app.authenticate, so this fake verifier is
    // never invoked — it exists only so buildApp() can construct without a
    // real SUPABASE_URL (fail-secure registration is mandatory for every
    // route, per plugins/auth.ts), same convention as routes/health.test.ts.
    authOverrides: {
      jwtVerifier: {
        verify: async () => {
          throw new Error("unexpected: OTP routes should never trigger JWT verification");
        },
      },
    },
    otpAuthOverrides: { eligibilityRepository, challengeStore, otpSender },
    staffOverrides: { staffRepository: new FakeStaffRepository() },
  });
  return { app, eligibilityRepository, otpSender };
}

describe("POST /api/v1/auth/otp/request (end-to-end through the real app)", () => {
  it("Test A — valid eligibility: dispatches OTP and returns a challengeId, no phone in response", async () => {
    const { app, eligibilityRepository, otpSender } = await buildTestApp();
    eligibilityRepository.addLink("ROLL-1", "father", "+911111111111");

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/otp/request",
      payload: { rollNumber: "ROLL-1", relationshipType: "father" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Object.keys(body)).toEqual(["challengeId"]);
    expect(typeof body.challengeId).toBe("string");
    expect(JSON.stringify(body)).not.toContain("+911111111111");
    expect(otpSender.sentTo).toEqual(["+911111111111"]);
    await app.close();
  });

  it("Test B — invalid roll number: 200 with a challengeId, but no OTP dispatched", async () => {
    const { app, otpSender } = await buildTestApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/otp/request",
      payload: { rollNumber: "NO-SUCH-ROLL", relationshipType: "father" },
    });

    expect(res.statusCode).toBe(200);
    expect(typeof res.json().challengeId).toBe("string");
    expect(otpSender.sentTo).toEqual([]);
    await app.close();
  });

  it("Test C — wrong relationship: a real student with a different relationship linked does not dispatch", async () => {
    const { app, eligibilityRepository, otpSender } = await buildTestApp();
    eligibilityRepository.addLink("ROLL-2", "mother", "+922222222222");

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/otp/request",
      payload: { rollNumber: "ROLL-2", relationshipType: "father" },
    });

    expect(res.statusCode).toBe(200);
    expect(otpSender.sentTo).toEqual([]);
    await app.close();
  });

  it("Test D — arbitrary phone injection: a client-supplied phone field is rejected by the strict schema", async () => {
    const { app, eligibilityRepository, otpSender } = await buildTestApp();
    eligibilityRepository.addLink("ROLL-3", "father", "+933333333333");

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/otp/request",
      payload: { rollNumber: "ROLL-3", relationshipType: "father", phone: "+900000000000" },
    });

    expect(res.statusCode).toBe(400);
    expect(otpSender.sentTo).toEqual([]);
    await app.close();
  });

  it("Test E — direct phone-only request (no rollNumber/relationshipType) is rejected as invalid", async () => {
    const { app, otpSender } = await buildTestApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/otp/request",
      payload: { phone: "+900000000000" },
    });

    expect(res.statusCode).toBe(400);
    expect(otpSender.sentTo).toEqual([]);
    await app.close();
  });

  it("Test F — unregistered parent (relationship record absent): no OTP dispatched", async () => {
    const { app, eligibilityRepository, otpSender } = await buildTestApp();
    eligibilityRepository.addLink("ROLL-4", "father", "+944444444444");

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/otp/request",
      payload: { rollNumber: "ROLL-4", relationshipType: "guardian" },
    });

    expect(res.statusCode).toBe(200);
    expect(otpSender.sentTo).toEqual([]);
    await app.close();
  });

  it("Test I — enumeration resistance: eligible and ineligible requests return identical status/shape", async () => {
    const { app, eligibilityRepository } = await buildTestApp();
    eligibilityRepository.addLink("ROLL-5", "father", "+955555555555");

    const eligibleRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/otp/request",
      payload: { rollNumber: "ROLL-5", relationshipType: "father" },
    });
    const ineligibleRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/otp/request",
      payload: { rollNumber: "NONEXISTENT", relationshipType: "father" },
    });

    expect(eligibleRes.statusCode).toBe(ineligibleRes.statusCode);
    expect(Object.keys(eligibleRes.json())).toEqual(Object.keys(ineligibleRes.json()));
    await app.close();
  });

  it("an invalid relationshipType value is rejected", async () => {
    const { app } = await buildTestApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/otp/request",
      payload: { rollNumber: "ROLL-1", relationshipType: "uncle" },
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe("POST /api/v1/auth/otp/verify (end-to-end through the real app)", () => {
  it("Test A (continued) — a correct code for an eligible challenge returns real session tokens", async () => {
    const { app, eligibilityRepository, otpSender } = await buildTestApp();
    eligibilityRepository.addLink("ROLL-7", "father", "+977777777777");
    otpSender.setCode("+977777777777", "123456", SESSION);
    const requestRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/otp/request",
      payload: { rollNumber: "ROLL-7", relationshipType: "father" },
    });
    const { challengeId } = requestRes.json();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/otp/verify",
      payload: { challengeId, code: "123456" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(SESSION);
    await app.close();
  });

  it("Test E — a client-supplied phone field at verify time is rejected by the strict schema", async () => {
    const { app } = await buildTestApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/otp/verify",
      payload: {
        challengeId: "11111111-1111-1111-1111-111111111111",
        code: "123456",
        phone: "+900000000000",
      },
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("Test F/G — an ineligible request's challenge fails verification with a generic 401, regardless of code", async () => {
    const { app } = await buildTestApp();
    const requestRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/otp/request",
      payload: { rollNumber: "NO-SUCH-ROLL", relationshipType: "father" },
    });
    const { challengeId } = requestRes.json();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/otp/verify",
      payload: { challengeId, code: "000000" },
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("an unknown challengeId fails the same way (same status/shape) as an ineligible one", async () => {
    const { app } = await buildTestApp();
    const ineligibleRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/otp/request",
      payload: { rollNumber: "NO-SUCH-ROLL", relationshipType: "father" },
    });
    const { challengeId: ineligibleChallengeId } = ineligibleRes.json();

    const unknownRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/otp/verify",
      payload: { challengeId: "22222222-2222-2222-2222-222222222222", code: "123456" },
    });
    const ineligibleVerifyRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/otp/verify",
      payload: { challengeId: ineligibleChallengeId, code: "123456" },
    });

    expect(unknownRes.statusCode).toBe(ineligibleVerifyRes.statusCode);
    expect(Object.keys(unknownRes.json())).toEqual(Object.keys(ineligibleVerifyRes.json()));
    await app.close();
  });

  it("Test J — an existing protected route still requires real authentication, unaffected by the new OTP routes", async () => {
    const { app } = await buildTestApp();

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/leave-requests",
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("a malformed challengeId (not a uuid) is rejected as invalid, not treated as an unknown challenge", async () => {
    const { app } = await buildTestApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/otp/verify",
      payload: { challengeId: "not-a-uuid", code: "123456" },
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// Reception Dashboard Prompt 1 (Authentication Infrastructure).
describe("POST /api/v1/auth/staff/audit-events", () => {
  let privateKey: KeyLike;
  let publicKey: KeyLike;

  beforeAll(async () => {
    const pair = await generateTestKeyPair();
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;
  });

  const RECEPTION_AUTH = "reception-audit-auth-user";
  const PARENT_AUTH = "parent-audit-auth-user";

  async function buildAuditTestApp() {
    const authDb = new FakeAuthDbPort()
      .addStaff(RECEPTION_AUTH, "reception-audit-1", "reception_warden", "hostel-a")
      .addParent(PARENT_AUTH, "parent-audit-1");

    const jwtVerifier = createJwtVerifier(
      { supabaseUrl: "http://127.0.0.1:9999" },
      async () => publicKey,
    );

    const app = await buildApp({
      authOverrides: { jwtVerifier, authDbPort: authDb },
      otpAuthOverrides: {
        eligibilityRepository: new FakeEligibilityRepository(),
        challengeStore: new InMemoryOtpChallengeStore(),
        otpSender: new FakeOtpSender(),
      },
      staffOverrides: { staffRepository: new FakeStaffRepository() },
    });
    return { app };
  }

  async function tokenFor(sub: string) {
    return signTestJwt({ sub, privateKey });
  }

  it("unauthenticated: 401", async () => {
    const { app } = await buildAuditTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/staff/audit-events",
      payload: { event: "sign_in_success" },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("a non-staff caller (parent): 403 — this endpoint only records STAFF auth events", async () => {
    const { app } = await buildAuditTestApp();
    const token = await tokenFor(PARENT_AUTH);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/staff/audit-events",
      headers: { authorization: `Bearer ${token}` },
      payload: { event: "sign_in_success" },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("an unrecognized event value: 400, never silently accepted", async () => {
    const { app } = await buildAuditTestApp();
    const token = await tokenFor(RECEPTION_AUTH);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/staff/audit-events",
      headers: { authorization: `Bearer ${token}` },
      payload: { event: "staff_deleted_the_database" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("a genuine staff caller reporting sign_in_success: 204, no body", async () => {
    const { app } = await buildAuditTestApp();
    const token = await tokenFor(RECEPTION_AUTH);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/staff/audit-events",
      headers: { authorization: `Bearer ${token}` },
      payload: { event: "sign_in_success" },
    });
    // No real database is wired in this test app (no dbOverride for
    // staffAuthAudit's own db.insert call) — the write itself is expected
    // to fail and be swallowed (recordStaffAuthEvent's own fire-and-forget
    // try/catch, mirroring device/service.ts). What this test actually
    // proves is the ROUTE-LEVEL contract: a genuine staff caller with a
    // valid event reaches 204, not 403/400 — the write path itself is
    // covered by the real-Postgres integration suite
    // (apps/api/src/domain/*.integration.test.ts convention) rather than
    // asserted here.
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe("");
    await app.close();
  });

  it("every declared event value is accepted for a genuine staff caller", async () => {
    const { app } = await buildAuditTestApp();
    const token = await tokenFor(RECEPTION_AUTH);
    for (const event of ["sign_in_success", "mfa_success", "mfa_failure", "sign_out"]) {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/staff/audit-events",
        headers: { authorization: `Bearer ${token}` },
        payload: { event },
      });
      expect(res.statusCode).toBe(204);
    }
    await app.close();
  });
});
