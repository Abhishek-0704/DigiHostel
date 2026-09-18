import { describe, it, expect, beforeAll } from "vitest";
import { buildApp } from "../app.js";
import { FakeAuthDbPort } from "../lib/auth/__fixtures__/fake-db-port.js";
import { generateTestKeyPair, signTestJwt } from "../lib/auth/__fixtures__/test-jwt.js";
import { createJwtVerifier } from "../lib/auth/jwt.js";
import { FakeOtpSender } from "../domain/auth/__fixtures__/fake-otp-sender.js";
import { FakeStaffRepository } from "../domain/staff/__fixtures__/fake-repository.js";
import type { KeyLike } from "jose";

// End-to-end through the real Fastify app (app.ts + plugins/auth.ts +
// routes/test-auth.ts wired together exactly as production does), but with
// the JWT verifier and DB port injected as deterministic fakes — no network
// call, no live database, no remote OR local Supabase project required to
// run this suite. This is what actually proves the wiring works, not just
// each unit in isolation (jwt.test.ts, guards.test.ts).

describe("test-auth routes (end-to-end through the real app)", () => {
  let privateKey: KeyLike;
  let publicKey: KeyLike;
  let db: FakeAuthDbPort;

  beforeAll(async () => {
    const pair = await generateTestKeyPair();
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;
  });

  async function buildTestApp() {
    db = new FakeAuthDbPort()
      .addStudent("student-user", "student-1", "hostel-1")
      .addStaff("admin-user", "staff-1", "super_admin", null)
      .addStaff("reception-user", "staff-2", "reception_warden", "hostel-1");

    const jwtVerifier = createJwtVerifier(
      { supabaseUrl: "http://127.0.0.1:9999" },
      async () => publicKey,
    );

    return buildApp({
      authOverrides: { jwtVerifier, authDbPort: db },
      otpAuthOverrides: { otpSender: new FakeOtpSender() },
      staffOverrides: { staffRepository: new FakeStaffRepository() },
    });
  }

  it("GET /api/v1/healthz stays public — unaffected by the auth boundary", async () => {
    const app = await buildTestApp();
    const response = await app.inject({ method: "GET", url: "/api/v1/healthz" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", version: "unknown" });
    await app.close();
  });

  it("unauthenticated denial: no Authorization header -> 401", async () => {
    const app = await buildTestApp();
    const response = await app.inject({ method: "GET", url: "/api/v1/_internal/whoami" });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("scenario 12: valid authorized request -> success", async () => {
    const app = await buildTestApp();
    const token = await signTestJwt({ sub: "student-user", privateKey });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/_internal/whoami",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ userId: "student-user", profileKind: "student" });
    await app.close();
  });

  it("role-based denial: authenticated non-admin hits an admin-only route -> 403", async () => {
    const app = await buildTestApp();
    const token = await signTestJwt({ sub: "reception-user", privateKey });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/_internal/staff-only",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("valid authorized admin request to the admin-only route -> success", async () => {
    const app = await buildTestApp();
    const token = await signTestJwt({ sub: "admin-user", privateKey });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/_internal/staff-only",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("does not leak token contents in the 401 response body", async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/_internal/whoami",
      headers: { authorization: "Bearer not-a-real-token" },
    });
    const body = response.body;
    expect(response.statusCode).toBe(401);
    expect(body).not.toContain("not-a-real-token");
    await app.close();
  });
});
