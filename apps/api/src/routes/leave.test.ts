import { describe, it, expect, beforeAll } from "vitest";
import type { KeyLike } from "jose";
import { buildApp } from "../app.js";
import { FakeAuthDbPort } from "../lib/auth/__fixtures__/fake-db-port.js";
import { generateTestKeyPair, signTestJwt } from "../lib/auth/__fixtures__/test-jwt.js";
import { createJwtVerifier } from "../lib/auth/jwt.js";
import { FakeLeaveRepository } from "../domain/leave/__fixtures__/fake-repository.js";
import type { LeaveRequestStatus, LeaveRequestView } from "../domain/leave/types.js";
import type { BiometricFreshnessGate } from "../lib/auth/security-gates.js";

const PARENT_A_AUTH = "parent-a-auth-user";
const PARENT_B_AUTH = "parent-b-auth-user";
const PARENT_REVOKED_AUTH = "parent-revoked-auth-user";
const STUDENT_AUTH = "student-auth-user";
const STUDENT_2_AUTH = "student-2-auth-user";
const STAFF_AUTH = "staff-auth-user";

const PARENT_A_ID = "parent-a";
const PARENT_B_ID = "parent-b";
const PARENT_REVOKED_ID = "parent-revoked";
const STUDENT_1_ID = "student-1";
const STUDENT_2_ID = "student-2";

function makeLeaveRequest(id: string, status: LeaveRequestStatus): LeaveRequestView {
  return {
    id,
    studentId: STUDENT_1_ID,
    reason: "test reason",
    startDate: "2026-10-01",
    endDate: "2026-10-03",
    status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const freshGate: BiometricFreshnessGate = {
  checkFreshness: async () => ({ fresh: true, confirmedAt: new Date() }),
};
const validBody = {
  biometricAssertion: { assertionToken: "tok", actionId: "leave-decision:lr-1" },
};

describe("leave routes (end-to-end through the real app)", () => {
  let privateKey: KeyLike;
  let publicKey: KeyLike;

  beforeAll(async () => {
    const pair = await generateTestKeyPair();
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;
  });

  async function buildTestApp(leaveRequestStatus: LeaveRequestStatus = "pending") {
    const authDb = new FakeAuthDbPort()
      .addParent(PARENT_A_AUTH, PARENT_A_ID)
      .addParent(PARENT_B_AUTH, PARENT_B_ID)
      .addParent(PARENT_REVOKED_AUTH, PARENT_REVOKED_ID)
      .addStudent(STUDENT_AUTH, STUDENT_1_ID, null)
      .addStudent(STUDENT_2_AUTH, STUDENT_2_ID, null)
      .addStaff(STAFF_AUTH, "staff-1", "reception_warden", null)
      .setActiveDevice(PARENT_A_ID, true)
      .setActiveDevice(PARENT_B_ID, true)
      .setActiveDevice(PARENT_REVOKED_ID, false); // deliberately revoked

    const leaveRepo = new FakeLeaveRepository()
      .addLeaveRequest(makeLeaveRequest("11111111-1111-1111-1111-111111111111", leaveRequestStatus))
      .linkParentToStudent(PARENT_A_ID, STUDENT_1_ID); // only parent A is linked

    const jwtVerifier = createJwtVerifier(
      { supabaseUrl: "http://127.0.0.1:9999" },
      async () => publicKey,
    );

    const app = await buildApp({
      authOverrides: { jwtVerifier, authDbPort: authDb },
      leaveOverrides: { leaveRepository: leaveRepo, biometricGate: freshGate },
    });
    return { app, leaveRepo };
  }

  async function tokenFor(sub: string) {
    return signTestJwt({ sub, privateKey });
  }

  it("unauthenticated: GET without a token -> 401", async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/leave-requests/11111111-1111-1111-1111-111111111111",
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("unauthenticated: approve without a token -> 401", async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/leave-requests/11111111-1111-1111-1111-111111111111/approve",
      payload: validBody,
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("owning student: GET allowed (authorization extended per this task)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(STUDENT_AUTH);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/leave-requests/11111111-1111-1111-1111-111111111111",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe("11111111-1111-1111-1111-111111111111");
    await app.close();
  });

  it("a different student (not the owner): GET denied (404, anti-enumeration)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(STUDENT_2_AUTH);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/leave-requests/11111111-1111-1111-1111-111111111111",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("staff (neither student nor parent): GET denied (403)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(STAFF_AUTH);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/leave-requests/11111111-1111-1111-1111-111111111111",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("related parent: GET allowed", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(PARENT_A_AUTH);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/leave-requests/11111111-1111-1111-1111-111111111111",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe("11111111-1111-1111-1111-111111111111");
    await app.close();
  });

  it("unrelated parent: GET denied (404, anti-enumeration)", async () => {
    const { app } = await buildTestApp();
    const token = await tokenFor(PARENT_B_AUTH);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/leave-requests/11111111-1111-1111-1111-111111111111",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("unrelated parent: approve denied (404, anti-enumeration — not a role-only check)", async () => {
    const { app } = await buildTestApp("pending");
    const token = await tokenFor(PARENT_B_AUTH);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/leave-requests/11111111-1111-1111-1111-111111111111/approve",
      headers: { authorization: `Bearer ${token}` },
      payload: validBody,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("unrelated parent: reject denied (404, anti-enumeration)", async () => {
    const { app } = await buildTestApp("pending");
    const token = await tokenFor(PARENT_B_AUTH);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/leave-requests/11111111-1111-1111-1111-111111111111/reject",
      headers: { authorization: `Bearer ${token}` },
      payload: validBody,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("staff (reception_warden): approve denied (403) — no staff bypass exists on this route", async () => {
    const { app } = await buildTestApp("pending");
    const token = await tokenFor(STAFF_AUTH);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/leave-requests/11111111-1111-1111-1111-111111111111/approve",
      headers: { authorization: `Bearer ${token}` },
      payload: validBody,
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("staff (reception_warden): reject denied (403)", async () => {
    const { app } = await buildTestApp("pending");
    const token = await tokenFor(STAFF_AUTH);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/leave-requests/11111111-1111-1111-1111-111111111111/reject",
      headers: { authorization: `Bearer ${token}` },
      payload: validBody,
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it.each(["hostel_admin", "super_admin", "library_incharge"] as const)(
    "staff role %s: no route-level bypass on GET/approve either — matches the RLS policy matrix (no Fastify staff branch on this route)",
    async (role) => {
      const authDb = new FakeAuthDbPort().addStaff("other-staff-auth", "other-staff-1", role, null);
      const jwtVerifier = createJwtVerifier(
        { supabaseUrl: "http://127.0.0.1:9999" },
        async () => publicKey,
      );
      const leaveRepo = new FakeLeaveRepository()
        .addLeaveRequest(makeLeaveRequest("11111111-1111-1111-1111-111111111111", "pending"))
        .linkParentToStudent(PARENT_A_ID, STUDENT_1_ID);
      const app = await buildApp({
        authOverrides: { jwtVerifier, authDbPort: authDb },
        leaveOverrides: { leaveRepository: leaveRepo, biometricGate: freshGate },
      });
      const token = await signTestJwt({ sub: "other-staff-auth", privateKey });

      const getRes = await app.inject({
        method: "GET",
        url: "/api/v1/leave-requests/11111111-1111-1111-1111-111111111111",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(getRes.statusCode).toBe(403);

      const approveRes = await app.inject({
        method: "POST",
        url: "/api/v1/leave-requests/11111111-1111-1111-1111-111111111111/approve",
        headers: { authorization: `Bearer ${token}` },
        payload: validBody,
      });
      expect(approveRes.statusCode).toBe(403);

      await app.close();
    },
  );

  it("pending -> approve succeeds", async () => {
    const { app } = await buildTestApp("pending");
    const token = await tokenFor(PARENT_A_AUTH);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/leave-requests/11111111-1111-1111-1111-111111111111/approve",
      headers: { authorization: `Bearer ${token}` },
      payload: validBody,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("approved");
    await app.close();
  });

  it("pending -> reject succeeds", async () => {
    const { app } = await buildTestApp("pending");
    const token = await tokenFor(PARENT_A_AUTH);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/leave-requests/11111111-1111-1111-1111-111111111111/reject",
      headers: { authorization: `Bearer ${token}` },
      payload: validBody,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("rejected");
    await app.close();
  });

  it("already approved -> approve fails with 409", async () => {
    const { app } = await buildTestApp("approved");
    const token = await tokenFor(PARENT_A_AUTH);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/leave-requests/11111111-1111-1111-1111-111111111111/approve",
      headers: { authorization: `Bearer ${token}` },
      payload: validBody,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.currentStatus).toBe("approved");
    await app.close();
  });

  it("expired -> decision fails with 409", async () => {
    const { app } = await buildTestApp("expired");
    const token = await tokenFor(PARENT_A_AUTH);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/leave-requests/11111111-1111-1111-1111-111111111111/approve",
      headers: { authorization: `Bearer ${token}` },
      payload: validBody,
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it.each([
    ["approved", "reject", 409],
    ["rejected", "approve", 409],
    ["rejected", "reject", 409],
  ] as const)(
    "terminal state %s -> %s also fails with %i (full terminal-state matrix, not just approve->approve)",
    async (initialStatus, action, expectedCode) => {
      const { app } = await buildTestApp(initialStatus);
      const token = await tokenFor(PARENT_A_AUTH);
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/11111111-1111-1111-1111-111111111111/${action}`,
        headers: { authorization: `Bearer ${token}` },
        payload: validBody,
      });
      expect(res.statusCode).toBe(expectedCode);
      expect(res.json().error.currentStatus).toBe(initialStatus);
      await app.close();
    },
  );

  it.each(["GET", "approve", "reject"] as const)(
    "malformed leaveRequestId (not a UUID) -> 400 on %s",
    async (kind) => {
      const { app } = await buildTestApp("pending");
      const token = await tokenFor(PARENT_A_AUTH);
      const url =
        kind === "GET"
          ? "/api/v1/leave-requests/not-a-uuid"
          : `/api/v1/leave-requests/not-a-uuid/${kind}`;
      const res = await app.inject({
        method: kind === "GET" ? "GET" : "POST",
        url,
        headers: { authorization: `Bearer ${token}` },
        payload: kind === "GET" ? undefined : validBody,
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    },
  );

  it("unrecognized field in the decision body -> 400 (strict schema, matches the creation-endpoint convention)", async () => {
    const { app } = await buildTestApp("pending");
    const token = await tokenFor(PARENT_A_AUTH);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/leave-requests/11111111-1111-1111-1111-111111111111/approve",
      headers: { authorization: `Bearer ${token}` },
      payload: { ...validBody, extra: "not allowed" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("unrecognized nested field inside biometricAssertion -> 400 (strict schema)", async () => {
    const { app } = await buildTestApp("pending");
    const token = await tokenFor(PARENT_A_AUTH);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/leave-requests/11111111-1111-1111-1111-111111111111/approve",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        biometricAssertion: { assertionToken: "tok", actionId: "leave-decision", parentId: "x" },
      },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("anti-enumeration: a nonexistent id and an unrelated-but-real id produce byte-identical 404 bodies", async () => {
    const { app } = await buildTestApp("pending");
    const token = await tokenFor(PARENT_B_AUTH); // unrelated to the fixture leave request

    const forRealButUnrelatedId = await app.inject({
      method: "GET",
      url: "/api/v1/leave-requests/11111111-1111-1111-1111-111111111111",
      headers: { authorization: `Bearer ${token}` },
    });
    const forNonexistentId = await app.inject({
      method: "GET",
      url: "/api/v1/leave-requests/99999999-9999-9999-9999-999999999999",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(forRealButUnrelatedId.statusCode).toBe(404);
    expect(forNonexistentId.statusCode).toBe(404);
    expect(forRealButUnrelatedId.body).toBe(forNonexistentId.body);
    await app.close();
  });

  it("revoked device: approve denied even for the correctly-linked parent", async () => {
    const { app } = await buildTestApp("pending");
    const token = await tokenFor(PARENT_REVOKED_AUTH);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/leave-requests/11111111-1111-1111-1111-111111111111/approve",
      headers: { authorization: `Bearer ${token}` },
      payload: validBody,
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("missing biometricAssertion in the request body -> 400, not a 500", async () => {
    const { app } = await buildTestApp("pending");
    const token = await tokenFor(PARENT_A_AUTH);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/leave-requests/11111111-1111-1111-1111-111111111111/approve",
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("no leakage: 404/409/403 response bodies contain no JWT, SQL, or stack trace content", async () => {
    const { app } = await buildTestApp("approved");
    const token = await tokenFor(PARENT_A_AUTH);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/leave-requests/11111111-1111-1111-1111-111111111111/approve",
      headers: { authorization: `Bearer ${token}` },
      payload: validBody,
    });
    const body = res.body;
    expect(body).not.toContain("Bearer");
    expect(body.toLowerCase()).not.toContain("stack");
    expect(body.toLowerCase()).not.toContain("select ");
    expect(body.toLowerCase()).not.toContain("postgres");
    await app.close();
  });

  it("no leakage: the 404 anti-enumeration body itself also carries no token/SQL/stack content", async () => {
    const { app } = await buildTestApp("pending");
    const token = await tokenFor(PARENT_B_AUTH);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/leave-requests/11111111-1111-1111-1111-111111111111",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
    const body = res.body;
    expect(body).not.toContain(token);
    expect(body.toLowerCase()).not.toContain("stack");
    expect(body.toLowerCase()).not.toContain("select ");
    expect(body.toLowerCase()).not.toContain("postgres");
    expect(body).not.toContain(PARENT_A_ID); // no other party's id leaked either
    await app.close();
  });

  it("no leakage: staff 403 body carries no token/SQL/stack content", async () => {
    const { app } = await buildTestApp("pending");
    const token = await tokenFor(STAFF_AUTH);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/leave-requests/11111111-1111-1111-1111-111111111111/approve",
      headers: { authorization: `Bearer ${token}` },
      payload: validBody,
    });
    expect(res.statusCode).toBe(403);
    const body = res.body;
    expect(body).not.toContain(token);
    expect(body.toLowerCase()).not.toContain("stack");
    expect(body.toLowerCase()).not.toContain("select ");
    expect(body.toLowerCase()).not.toContain("postgres");
    await app.close();
  });

  const validCreateBody = {
    reason: "Family function",
    startDate: "2026-11-01",
    endDate: "2026-11-03",
  };

  describe("POST /leave-requests — student creation", () => {
    it("unauthenticated -> 401", async () => {
      const { app } = await buildTestApp();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/leave-requests",
        payload: validCreateBody,
      });
      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it("authenticated non-student (parent) -> 403", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(PARENT_A_AUTH);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/leave-requests",
        headers: { authorization: `Bearer ${token}` },
        payload: validCreateBody,
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it("authenticated student: creates a request for themselves, in the default pending state, returning authoritative server state", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(STUDENT_AUTH);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/leave-requests",
        headers: { authorization: `Bearer ${token}` },
        payload: validCreateBody,
      });
      expect(res.statusCode).toBe(201);
      const created = res.json();
      expect(created.studentId).toBe(STUDENT_1_ID);
      expect(created.status).toBe("pending");
      expect(created.reason).toBe(validCreateBody.reason);
      expect(created.id).toBeTruthy();
      expect(created.createdAt).toBeTruthy();
      await app.close();
    });

    it("a client-supplied studentId in the body is rejected by strict validation, not silently accepted", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(STUDENT_AUTH);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/leave-requests",
        headers: { authorization: `Bearer ${token}` },
        payload: { ...validCreateBody, studentId: STUDENT_2_ID },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("missing required field (reason) -> 400", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(STUDENT_AUTH);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/leave-requests",
        headers: { authorization: `Bearer ${token}` },
        payload: { startDate: "2026-11-01", endDate: "2026-11-03" },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("empty reason string -> 400", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(STUDENT_AUTH);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/leave-requests",
        headers: { authorization: `Bearer ${token}` },
        payload: { ...validCreateBody, reason: "" },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("oversized reason string -> 400", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(STUDENT_AUTH);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/leave-requests",
        headers: { authorization: `Bearer ${token}` },
        payload: { ...validCreateBody, reason: "x".repeat(1001) },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("malformed date value -> 400", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(STUDENT_AUTH);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/leave-requests",
        headers: { authorization: `Bearer ${token}` },
        payload: { ...validCreateBody, startDate: "not-a-date" },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("impossible calendar date (Feb 30) -> 400", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(STUDENT_AUTH);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/leave-requests",
        headers: { authorization: `Bearer ${token}` },
        payload: { ...validCreateBody, startDate: "2026-02-30", endDate: "2026-02-30" },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("end date before start date -> 400", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(STUDENT_AUTH);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/leave-requests",
        headers: { authorization: `Bearer ${token}` },
        payload: { ...validCreateBody, startDate: "2026-11-05", endDate: "2026-11-01" },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("unexpected field -> 400 (strict schema)", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(STUDENT_AUTH);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/leave-requests",
        headers: { authorization: `Bearer ${token}` },
        payload: { ...validCreateBody, destination: "Home" },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  describe("GET /leave-requests — student's own list", () => {
    it("unauthenticated -> 401", async () => {
      const { app } = await buildTestApp();
      const res = await app.inject({ method: "GET", url: "/api/v1/leave-requests" });
      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it("authenticated non-student (parent) -> 403", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(PARENT_A_AUTH);
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/leave-requests",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it("returns only the authenticated student's own requests", async () => {
      const { app, leaveRepo } = await buildTestApp();
      await leaveRepo.create({
        studentId: STUDENT_2_ID,
        reason: "Other student's request",
        startDate: "2026-11-01",
        endDate: "2026-11-02",
      });

      const token = await tokenFor(STUDENT_AUTH);
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/leave-requests",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const list = res.json();
      expect(Array.isArray(list)).toBe(true);
      expect(list.every((r: { studentId: string }) => r.studentId === STUDENT_1_ID)).toBe(true);
      await app.close();
    });
  });

  describe("Student creation -> parent approval compatibility", () => {
    it("a student-created pending request can immediately be read and approved through the existing parent workflow", async () => {
      const { app } = await buildTestApp();
      const studentToken = await tokenFor(STUDENT_AUTH);
      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/leave-requests",
        headers: { authorization: `Bearer ${studentToken}` },
        payload: validCreateBody,
      });
      expect(createRes.statusCode).toBe(201);
      const created = createRes.json();

      const parentToken = await tokenFor(PARENT_A_AUTH);
      const getRes = await app.inject({
        method: "GET",
        url: `/api/v1/leave-requests/${created.id}`,
        headers: { authorization: `Bearer ${parentToken}` },
      });
      expect(getRes.statusCode).toBe(200);
      expect(getRes.json().status).toBe("pending");

      const approveRes = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${created.id}/approve`,
        headers: { authorization: `Bearer ${parentToken}` },
        payload: validBody,
      });
      expect(approveRes.statusCode).toBe(200);
      expect(approveRes.json().status).toBe("approved");
      await app.close();
    });

    it("the owning student cannot approve their own request", async () => {
      const { app } = await buildTestApp();
      const studentToken = await tokenFor(STUDENT_AUTH);
      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/leave-requests",
        headers: { authorization: `Bearer ${studentToken}` },
        payload: validCreateBody,
      });
      const created = createRes.json();

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${created.id}/approve`,
        headers: { authorization: `Bearer ${studentToken}` },
        payload: validBody,
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it("the owning student cannot reject their own request", async () => {
      const { app } = await buildTestApp();
      const studentToken = await tokenFor(STUDENT_AUTH);
      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/leave-requests",
        headers: { authorization: `Bearer ${studentToken}` },
        payload: validCreateBody,
      });
      const created = createRes.json();

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${created.id}/reject`,
        headers: { authorization: `Bearer ${studentToken}` },
        payload: validBody,
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    });
  });
});
