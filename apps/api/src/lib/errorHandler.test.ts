import { describe, it, expect } from "vitest";
import { buildApp } from "../app.js";
import { FakeAuthDbPort } from "./auth/__fixtures__/fake-db-port.js";
import { generateTestKeyPair, signTestJwt } from "./auth/__fixtures__/test-jwt.js";
import { createJwtVerifier } from "./auth/jwt.js";
import { FakeLeaveRepository } from "../domain/leave/__fixtures__/fake-repository.js";
import { FakeOtpSender } from "../domain/auth/__fixtures__/fake-otp-sender.js";
import { FakeStaffRepository } from "../domain/staff/__fixtures__/fake-repository.js";
import type { BiometricFreshnessGate } from "./auth/security-gates.js";

/**
 * Focused tests for the global error handler (G-01) — proves both halves of
 * the requirement: expected/typed errors keep their precise existing
 * behavior (unaffected by this change), and genuinely unexpected errors
 * never leak internal detail. routes/leave.test.ts already covers the full
 * "no leakage" surface for typed domain errors (404/409/403 bodies); this
 * file is specifically about what happens when an error ISN'T one of those
 * typed cases.
 */

const freshGate: BiometricFreshnessGate = {
  checkFreshness: async () => ({ fresh: true, confirmedAt: new Date() }),
};

async function buildTestApp() {
  const authDb = new FakeAuthDbPort()
    .addParent("parent-auth", "parent-1")
    .setActiveDevice("parent-1", true);
  const leaveRepo = new FakeLeaveRepository();
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
  });
  const token = await signTestJwt({ sub: "parent-auth", privateKey: pair.privateKey });
  return { app, leaveRepo, token };
}

describe("global error handler (G-01)", () => {
  it("an unexpected repository error (e.g. a raw DB failure) never leaks its message, connection details, or a stack trace to the client", async () => {
    const { app, leaveRepo, token } = await buildTestApp();
    // Simulate exactly the kind of raw internal detail a real DB driver
    // error could carry (a connection string with embedded credentials) —
    // this must never reach the client, only the server-side log.
    leaveRepo.findAccessibleLeaveRequest = async () => {
      throw new Error("connection to postgres://app:s3cr3t@db-host:5432/digihostel failed");
    };

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/leave-requests/11111111-1111-1111-1111-111111111111",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      error: {
        code: "internal_error",
        message: "An unexpected error occurred.",
        requestId: expect.any(String),
      },
    });
    expect(res.headers["x-request-id"]).toEqual(res.json().error.requestId);
    expect(res.body).not.toContain("postgres://");
    expect(res.body).not.toContain("s3cr3t");
    expect(res.body.toLowerCase()).not.toContain("connection to");
    expect(res.body.toLowerCase()).not.toContain("stack");
    await app.close();
  });

  it("an unexpected error thrown from the create path is sanitized identically", async () => {
    const leaveRepo = new FakeLeaveRepository();
    leaveRepo.create = async () => {
      throw new Error("duplicate key value violates unique constraint leave_requests_pkey");
    };
    const authDb = new FakeAuthDbPort().addStudent("student-auth", "student-1", null);
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
    });
    const studentToken = await signTestJwt({ sub: "student-auth", privateKey: pair.privateKey });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/leave-requests",
      headers: { authorization: `Bearer ${studentToken}` },
      payload: { reason: "test", startDate: "2026-11-01", endDate: "2026-11-02" },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      error: {
        code: "internal_error",
        message: "An unexpected error occurred.",
        requestId: expect.any(String),
      },
    });
    expect(res.body.toLowerCase()).not.toContain("constraint");
    expect(res.body.toLowerCase()).not.toContain("duplicate key");
    await app.close();
  });

  it("a known/typed domain error is unaffected — still a precise, existing 404, not swallowed into a generic 500", async () => {
    const { app, token } = await buildTestApp();
    // No leave request exists in this fake repo -> LeaveRequestNotFoundError
    // -> handled entirely inside the route (sendLeaveError), never reaches
    // the global handler tested above.
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/leave-requests/99999999-9999-9999-9999-999999999999",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("leave_request_not_found");
    await app.close();
  });

  it("Fastify's own framework-generated client error (malformed JSON body) surfaces its safe, generic message with the correct status — not collapsed to a 500", async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/leave-requests",
      headers: { "content-type": "application/json" },
      payload: "{not valid json",
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBeDefined();
    expect(body.error.message).not.toContain("Bearer");
    await app.close();
  });
});
