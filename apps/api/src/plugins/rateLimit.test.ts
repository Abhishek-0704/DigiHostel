import { describe, it, expect } from "vitest";
import { buildApp } from "../app.js";
import { FakeAuthDbPort } from "../lib/auth/__fixtures__/fake-db-port.js";
import { generateTestKeyPair, signTestJwt } from "../lib/auth/__fixtures__/test-jwt.js";
import { createJwtVerifier } from "../lib/auth/jwt.js";
import { FakeLeaveRepository } from "../domain/leave/__fixtures__/fake-repository.js";
import { FakeOtpSender } from "../domain/auth/__fixtures__/fake-otp-sender.js";
import { FakeStaffRepository } from "../domain/staff/__fixtures__/fake-repository.js";
import type { LeaveRequestStatus, LeaveRequestView } from "../domain/leave/types.js";
import type { BiometricFreshnessGate } from "../lib/auth/security-gates.js";

/**
 * Focused tests for global + per-route rate limiting (G-02). Every test
 * uses small, injected tier overrides (plugins/rateLimit.ts's
 * RegisterRateLimitOverrides) rather than the production defaults in
 * config/rateLimit.ts, so these tests run fast and deterministically instead
 * of needing to actually wait out a real 60s window.
 */

const freshGate: BiometricFreshnessGate = {
  checkFreshness: async () => ({ fresh: true, confirmedAt: new Date() }),
};

// Default "father_notified", not "pending" — Reception-Initiated Parent
// Approval correction: a `pending` request is no longer parent-decidable, and
// this file's approve-route rate-limit tests below need a real 200 from
// decide() to prove the tier applies independently of read-route traffic.
function makeLeaveRequest(
  id: string,
  status: LeaveRequestStatus = "father_notified",
): LeaveRequestView {
  return {
    id,
    studentId: "student-1",
    reason: "test",
    startDate: "2026-10-01",
    endDate: "2026-10-03",
    status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function buildTestApp(overrides: Parameters<typeof buildApp>[0] = {}) {
  const authDb = new FakeAuthDbPort()
    .addParent("parent-auth", "parent-1")
    .addStudent("student-auth", "student-1", null)
    .setActiveDevice("parent-1", true);
  const leaveRepo = new FakeLeaveRepository()
    .addLeaveRequest(makeLeaveRequest("11111111-1111-1111-1111-111111111111"))
    .linkParentToStudent("parent-1", "student-1");
  const pair = await generateTestKeyPair();
  const jwtVerifier = createJwtVerifier(
    { supabaseUrl: "http://127.0.0.1:9999" },
    async () => pair.publicKey,
  );
  const app = await buildApp({
    authOverrides: { jwtVerifier, authDbPort: authDb },
    leaveOverrides: { leaveRepository: leaveRepo, biometricGate: freshGate },
    otpAuthOverrides: { otpSender: new FakeOtpSender() },
    staffOverrides: { staffRepository: new FakeStaffRepository() },
    ...overrides,
  });
  const parentToken = await signTestJwt({ sub: "parent-auth", privateKey: pair.privateKey });
  const studentToken = await signTestJwt({ sub: "student-auth", privateKey: pair.privateKey });
  return { app, parentToken, studentToken };
}

describe("rate limiting (G-02)", () => {
  it("requests at or below the configured limit all succeed", async () => {
    const { app, parentToken } = await buildTestApp({
      rateLimitOverrides: { tiers: { global: { max: 5, timeWindow: 60_000 } } },
    });
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/leave-requests",
        headers: { authorization: `Bearer ${parentToken}` },
      });
      expect(res.statusCode).toBe(200);
    }
    await app.close();
  });

  it("a request past the configured limit is rejected with 429 and this app's standard error shape", async () => {
    const { app, parentToken } = await buildTestApp({
      rateLimitOverrides: { tiers: { global: { max: 2, timeWindow: 60_000 } } },
    });
    await app.inject({
      method: "GET",
      url: "/api/v1/leave-requests",
      headers: { authorization: `Bearer ${parentToken}` },
    });
    await app.inject({
      method: "GET",
      url: "/api/v1/leave-requests",
      headers: { authorization: `Bearer ${parentToken}` },
    });
    const third = await app.inject({
      method: "GET",
      url: "/api/v1/leave-requests",
      headers: { authorization: `Bearer ${parentToken}` },
    });
    expect(third.statusCode).toBe(429);
    expect(third.json().error.code).toBe("rate_limited");
    await app.close();
  });

  it("rate limiting runs before authentication and still throttles unauthenticated requests (protects against pre-auth flooding, not just post-auth abuse)", async () => {
    const { app } = await buildTestApp({
      rateLimitOverrides: { tiers: { global: { max: 1, timeWindow: 60_000 } } },
    });
    const first = await app.inject({ method: "GET", url: "/api/v1/leave-requests" });
    expect(first.statusCode).toBe(401); // no token, but within the limit
    const second = await app.inject({ method: "GET", url: "/api/v1/leave-requests" });
    expect(second.statusCode).toBe(429); // limit exceeded, before auth ever runs
    await app.close();
  });

  it("independent source identities (IPs) get independent buckets — one caller exceeding the limit does not affect another", async () => {
    const { app, parentToken } = await buildTestApp({
      rateLimitOverrides: { tiers: { global: { max: 1, timeWindow: 60_000 } } },
    });
    const fromFirstIp = await app.inject({
      method: "GET",
      url: "/api/v1/leave-requests",
      headers: { authorization: `Bearer ${parentToken}` },
      remoteAddress: "10.0.0.1",
    });
    expect(fromFirstIp.statusCode).toBe(200);

    const firstIpExceeded = await app.inject({
      method: "GET",
      url: "/api/v1/leave-requests",
      headers: { authorization: `Bearer ${parentToken}` },
      remoteAddress: "10.0.0.1",
    });
    expect(firstIpExceeded.statusCode).toBe(429);

    const fromSecondIp = await app.inject({
      method: "GET",
      url: "/api/v1/leave-requests",
      headers: { authorization: `Bearer ${parentToken}` },
      remoteAddress: "10.0.0.2",
    });
    expect(fromSecondIp.statusCode).toBe(200); // independent bucket, unaffected
    await app.close();
  });

  it("the decision route (approve) is protected by its own stricter tier, independent of the global tier", async () => {
    const { app, parentToken } = await buildTestApp({
      rateLimitOverrides: {
        tiers: {
          global: { max: 1000, timeWindow: 60_000 }, // generous, would not itself trigger
          decision: { max: 1, timeWindow: 60_000 }, // strict
        },
      },
    });
    const body = {
      biometricAssertion: {
        assertionToken: "tok",
        actionId: "leave-decision:11111111-1111-1111-1111-111111111111",
      },
    };

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/leave-requests/11111111-1111-1111-1111-111111111111/approve",
      headers: { authorization: `Bearer ${parentToken}` },
      payload: body,
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: "POST",
      url: "/api/v1/leave-requests/11111111-1111-1111-1111-111111111111/approve",
      headers: { authorization: `Bearer ${parentToken}` },
      payload: body,
    });
    // Already approved by the first call -> would be 409 on its own merits,
    // but the strict decision tier (max 1) is exhausted first -> 429, not 409.
    expect(second.statusCode).toBe(429);
    await app.close();
  });

  it("no accidental bypass through an alternate route path: exhausting the read route's own limit does not exhaust — and is not exhausted by — the separately-tiered decision route's budget", async () => {
    const { app, parentToken } = await buildTestApp({
      rateLimitOverrides: {
        tiers: {
          global: { max: 1, timeWindow: 60_000 }, // covers the read route (GET)
          decision: { max: 5, timeWindow: 60_000 }, // covers approve/reject
        },
      },
    });
    // Exhaust the global (read-route) budget.
    await app.inject({
      method: "GET",
      url: "/api/v1/leave-requests",
      headers: { authorization: `Bearer ${parentToken}` },
    });
    const readExceeded = await app.inject({
      method: "GET",
      url: "/api/v1/leave-requests",
      headers: { authorization: `Bearer ${parentToken}` },
    });
    expect(readExceeded.statusCode).toBe(429);

    // The decision route has its own, separate budget and is unaffected.
    const approve = await app.inject({
      method: "POST",
      url: "/api/v1/leave-requests/11111111-1111-1111-1111-111111111111/approve",
      headers: { authorization: `Bearer ${parentToken}` },
      payload: {
        biometricAssertion: {
          assertionToken: "tok",
          actionId: "leave-decision:11111111-1111-1111-1111-111111111111",
        },
      },
    });
    expect(approve.statusCode).toBe(200);
    await app.close();
  });

  it("/healthz is exempt from rate limiting", async () => {
    const { app } = await buildTestApp({
      rateLimitOverrides: { tiers: { global: { max: 1, timeWindow: 60_000 } } },
    });
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({ method: "GET", url: "/api/v1/healthz" });
      expect(res.statusCode).toBe(200);
    }
    await app.close();
  });
});
