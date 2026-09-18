import { describe, it, expect, beforeAll } from "vitest";
import type { KeyLike } from "jose";
import { buildApp } from "../app.js";
import { FakeAuthDbPort } from "../lib/auth/__fixtures__/fake-db-port.js";
import { generateTestKeyPair, signTestJwt } from "../lib/auth/__fixtures__/test-jwt.js";
import { createJwtVerifier } from "../lib/auth/jwt.js";
import { FakeLeaveRepository } from "../domain/leave/__fixtures__/fake-repository.js";
import { FakeOtpSender } from "../domain/auth/__fixtures__/fake-otp-sender.js";
import { FakeStaffRepository } from "../domain/staff/__fixtures__/fake-repository.js";
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
// Matches LeaveService.decide()'s real action-binding check
// (`leave-decision:${leaveRequestId}`) against the fixed fixture id every
// approve/reject test below targets — see LEAVE_REQUEST_ID usage throughout
// `buildTestApp()`.
const validBody = {
  biometricAssertion: {
    assertionToken: "tok",
    actionId: "leave-decision:11111111-1111-1111-1111-111111111111",
  },
};

/** For the handful of tests that decide a leave request created dynamically
 * within the test itself (id unknown ahead of time) rather than the fixed
 * fixture id `validBody` targets. */
function biometricBodyFor(leaveRequestId: string) {
  return {
    biometricAssertion: { assertionToken: "tok", actionId: `leave-decision:${leaveRequestId}` },
  };
}

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
      otpAuthOverrides: { otpSender: new FakeOtpSender() },
      staffOverrides: { staffRepository: new FakeStaffRepository() },
    });
    return { app, leaveRepo };
  }

  async function tokenFor(sub: string, aal?: string) {
    return signTestJwt({ sub, privateKey, aal });
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
        otpAuthOverrides: { otpSender: new FakeOtpSender() },
        staffOverrides: { staffRepository: new FakeStaffRepository() },
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

  it("pending -> approve fails with 409 (not yet sent for parent approval by Reception)", async () => {
    const { app } = await buildTestApp("pending");
    const token = await tokenFor(PARENT_A_AUTH);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/leave-requests/11111111-1111-1111-1111-111111111111/approve",
      headers: { authorization: `Bearer ${token}` },
      payload: validBody,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.currentStatus).toBe("pending");
    await app.close();
  });

  it("father_notified -> approve succeeds", async () => {
    const { app } = await buildTestApp("father_notified");
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

  it("father_notified -> reject succeeds", async () => {
    const { app } = await buildTestApp("father_notified");
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

  describe("GET /leave-requests/:leaveRequestId/events (Approval History, Phase 4 Prompt 10)", () => {
    const LEAVE_ID = "11111111-1111-1111-1111-111111111111";

    it("unauthenticated: GET without a token -> 401", async () => {
      const { app } = await buildTestApp();
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/leave-requests/${LEAVE_ID}/events`,
      });
      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it("owning student: allowed, returns seeded events oldest-first", async () => {
      const { app, leaveRepo } = await buildTestApp();
      leaveRepo
        .addApprovalEvent(LEAVE_ID, {
          id: "22222222-2222-2222-2222-222222222222",
          eventType: "notified",
          response: null,
          biometricConfirmed: false,
          occurredAt: "2026-10-02T00:00:00.000Z",
        })
        .addApprovalEvent(LEAVE_ID, {
          id: "33333333-3333-3333-3333-333333333333",
          eventType: "responded",
          response: "approved",
          biometricConfirmed: true,
          occurredAt: "2026-10-01T00:00:00.000Z",
        });

      const token = await tokenFor(STUDENT_AUTH);
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/leave-requests/${LEAVE_ID}/events`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveLength(2);
      // Oldest first, by occurredAt — not insertion order.
      expect(body[0].id).toBe("33333333-3333-3333-3333-333333333333");
      expect(body[1].id).toBe("22222222-2222-2222-2222-222222222222");
      await app.close();
    });

    it("response shape never includes actor identity fields", async () => {
      const { app, leaveRepo } = await buildTestApp();
      leaveRepo.addApprovalEvent(LEAVE_ID, {
        id: "22222222-2222-2222-2222-222222222222",
        eventType: "responded",
        response: "approved",
        biometricConfirmed: true,
        occurredAt: new Date().toISOString(),
      });
      const token = await tokenFor(PARENT_A_AUTH);
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/leave-requests/${LEAVE_ID}/events`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const [event] = res.json();
      expect(Object.keys(event).sort()).toEqual(
        ["biometricConfirmed", "eventType", "id", "occurredAt", "response"].sort(),
      );
      expect(event).not.toHaveProperty("actorParentId");
      expect(event).not.toHaveProperty("actorStaffId");
      await app.close();
    });

    it("a different student (not the owner): denied (404, anti-enumeration)", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(STUDENT_2_AUTH);
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/leave-requests/${LEAVE_ID}/events`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it("staff (neither student nor parent): denied (403)", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(STAFF_AUTH);
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/leave-requests/${LEAVE_ID}/events`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it("related parent: allowed", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(PARENT_A_AUTH);
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/leave-requests/${LEAVE_ID}/events`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
      await app.close();
    });

    it("unrelated parent: denied (404, anti-enumeration)", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(PARENT_B_AUTH);
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/leave-requests/${LEAVE_ID}/events`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it("a real decide() call produces a queryable event via this route", async () => {
      const { app } = await buildTestApp("father_notified");
      const token = await tokenFor(PARENT_A_AUTH);
      const approveRes = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LEAVE_ID}/approve`,
        headers: { authorization: `Bearer ${token}` },
        payload: validBody,
      });
      expect(approveRes.statusCode).toBe(200);

      const eventsRes = await app.inject({
        method: "GET",
        url: `/api/v1/leave-requests/${LEAVE_ID}/events`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(eventsRes.statusCode).toBe(200);
      const events = eventsRes.json();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe("responded");
      expect(events[0].response).toBe("approved");
      expect(events[0].biometricConfirmed).toBe(true);
      await app.close();
    });
  });

  describe("GET /leave-requests/:leaveRequestId/events — staff access (Phase 3 Prompt 7B, Parent Approval Session Workspace)", () => {
    const RECEPTION_A_AUTH = "events-reception-a-auth";
    const RECEPTION_B_AUTH = "events-reception-b-auth";
    const SUPER_ADMIN_AUTH = "events-super-admin-auth";
    const LIBRARY_AUTH = "events-library-auth";
    const HOSTEL_A = "events-hostel-a";
    const HOSTEL_B = "events-hostel-b";
    const LEAVE_ID = "44444444-4444-4444-4444-444444444444";

    async function buildEventsStaffTestApp() {
      const authDb = new FakeAuthDbPort()
        .addStaff(RECEPTION_A_AUTH, "events-reception-a", "reception_warden", HOSTEL_A)
        .addStaff(RECEPTION_B_AUTH, "events-reception-b", "reception_warden", HOSTEL_B)
        .addStaff(SUPER_ADMIN_AUTH, "events-super-admin", "super_admin", null)
        .addStaff(LIBRARY_AUTH, "events-library", "library_incharge", null);

      const leaveRequest = makeLeaveRequest(LEAVE_ID, "father_notified");
      leaveRequest.studentId = STUDENT_1_ID;

      const leaveRepo = new FakeLeaveRepository()
        .addLeaveRequest(leaveRequest)
        .addApprovalEvent(LEAVE_ID, {
          id: "55555555-5555-5555-5555-555555555555",
          eventType: "escalated",
          response: null,
          biometricConfirmed: false,
          occurredAt: new Date().toISOString(),
        })
        .linkStudentToHostel(STUDENT_1_ID, HOSTEL_A)
        .linkStaffToHostel("events-reception-a", HOSTEL_A)
        .linkStaffToHostel("events-reception-b", HOSTEL_B);

      const jwtVerifier = createJwtVerifier(
        { supabaseUrl: "http://127.0.0.1:9999" },
        async () => publicKey,
      );

      const app = await buildApp({
        authOverrides: { jwtVerifier, authDbPort: authDb },
        leaveOverrides: { leaveRepository: leaveRepo, biometricGate: freshGate },
        otpAuthOverrides: { otpSender: new FakeOtpSender() },
        staffOverrides: { staffRepository: new FakeStaffRepository() },
      });
      return { app };
    }

    it("reception_warden, own hostel, AAL2: allowed, sees the real timeline", async () => {
      const { app } = await buildEventsStaffTestApp();
      const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/leave-requests/${LEAVE_ID}/events`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveLength(1);
      expect(body[0].eventType).toBe("escalated");
      expect(body[0]).not.toHaveProperty("actorParentId");
      expect(body[0]).not.toHaveProperty("actorStaffId");
      await app.close();
    });

    it("reception_warden, own hostel, AAL1 (MFA not completed): 403 insufficient_assurance, never 200", async () => {
      const { app } = await buildEventsStaffTestApp();
      const token = await tokenFor(RECEPTION_A_AUTH); // no aal -> aal1-equivalent
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/leave-requests/${LEAVE_ID}/events`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("insufficient_assurance");
      await app.close();
    });

    it("reception_warden, DIFFERENT hostel, AAL2: 404 (anti-enumeration, not 403) — the exact cross-hostel path the lae_select_staff remediation protects at the RLS layer, re-proven here at the Fastify layer", async () => {
      const { app } = await buildEventsStaffTestApp();
      const token = await tokenFor(RECEPTION_B_AUTH, "aal2");
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/leave-requests/${LEAVE_ID}/events`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it("super_admin, AAL2: allowed regardless of hostel", async () => {
      const { app } = await buildEventsStaffTestApp();
      const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/leave-requests/${LEAVE_ID}/events`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveLength(1);
      await app.close();
    });

    it("library_incharge, AAL2: 403 (no leave_requests RLS grant for that role, matching every other staff leave route)", async () => {
      const { app } = await buildEventsStaffTestApp();
      const token = await tokenFor(LIBRARY_AUTH, "aal2");
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/leave-requests/${LEAVE_ID}/events`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("role_required");
      await app.close();
    });

    it("nonexistent leave request, staff AAL2: 404, same as student/parent's anti-enumeration shape", async () => {
      const { app } = await buildEventsStaffTestApp();
      const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/leave-requests/99999999-9999-9999-9999-999999999999/events`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });

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

  describe("GET /leave-requests — own (student) or linked-students' (parent/guardian) list (G-05)", () => {
    it("unauthenticated -> 401", async () => {
      const { app } = await buildTestApp();
      const res = await app.inject({ method: "GET", url: "/api/v1/leave-requests" });
      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it("authenticated staff (neither student nor parent) -> 403", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(STAFF_AUTH);
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/leave-requests",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it("student: returns only the authenticated student's own requests", async () => {
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

    it("linked parent: returns their linked student's requests, never a client-supplied filter (G-05)", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(PARENT_A_AUTH); // linked to STUDENT_1_ID only
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/leave-requests",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const list = res.json();
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
      expect(list.every((r: { studentId: string }) => r.studentId === STUDENT_1_ID)).toBe(true);
      await app.close();
    });

    it("guardian relationship gets the same list access as a father/mother relationship (ADR-016 Model C — no relationship_type distinction)", async () => {
      const { app, leaveRepo } = await buildTestApp();
      leaveRepo.linkParentToStudent(PARENT_B_ID, STUDENT_1_ID); // simulate a second, e.g. guardian, link
      const token = await tokenFor("parent-b-auth-user");
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/leave-requests",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const list = res.json();
      expect(list.length).toBeGreaterThan(0);
      await app.close();
    });

    it("unrelated/unlinked parent: 200 with an empty array, never an error — no enumeration surface exists here (no id parameter to probe)", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(PARENT_B_AUTH); // never linked to any student in this fixture
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/leave-requests",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
      await app.close();
    });

    it("parent list response contains no other parent's identity or unrelated leakage", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(PARENT_A_AUTH);
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/leave-requests",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.body).not.toContain(PARENT_B_ID);
      expect(res.body).not.toContain(token);
      await app.close();
    });
  });

  describe("Student creation -> parent approval compatibility", () => {
    it("a student-created pending request stays pending (no automatic parent approval), and only becomes approvable once Reception explicitly starts parent approval", async () => {
      const { app, leaveRepo } = await buildTestApp();
      const studentToken = await tokenFor(STUDENT_AUTH);
      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/leave-requests",
        headers: { authorization: `Bearer ${studentToken}` },
        payload: validCreateBody,
      });
      expect(createRes.statusCode).toBe(201);
      const created = createRes.json();
      expect(created.status).toBe("pending");

      const parentToken = await tokenFor(PARENT_A_AUTH);
      const getRes = await app.inject({
        method: "GET",
        url: `/api/v1/leave-requests/${created.id}`,
        headers: { authorization: `Bearer ${parentToken}` },
      });
      expect(getRes.statusCode).toBe(200);
      expect(getRes.json().status).toBe("pending");

      // Reception-Initiated Parent Approval correction: a `pending` request
      // is NOT yet parent-decidable — no escalation/notification was
      // scheduled at creation, and a linked parent's decide() attempt is
      // rejected with 409, not silently accepted.
      const prematureApproveRes = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${created.id}/approve`,
        headers: { authorization: `Bearer ${parentToken}` },
        payload: biometricBodyFor(created.id),
      });
      expect(prematureApproveRes.statusCode).toBe(409);
      expect(prematureApproveRes.json().error.currentStatus).toBe("pending");

      // Reception (staff-1, reception_warden, same hostel as the student —
      // matching this fixture's hostel-scoping setup) explicitly starts
      // parent approval — the one and only path out of `pending`.
      leaveRepo.linkStaffToHostel("staff-1", "compat-hostel");
      leaveRepo.linkStudentToHostel(STUDENT_1_ID, "compat-hostel");
      const staffToken = await tokenFor(STAFF_AUTH, "aal2");
      const startRes = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${created.id}/send-for-parent-approval`,
        headers: { authorization: `Bearer ${staffToken}` },
      });
      expect(startRes.statusCode).toBe(200);
      expect(startRes.json().status).toBe("father_notified");

      const approveRes = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${created.id}/approve`,
        headers: { authorization: `Bearer ${parentToken}` },
        payload: biometricBodyFor(created.id),
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

  describe("POST /leave-requests/:id/expire (ADR-019 §2 — staff-only, from manual_verification only)", () => {
    const RECEPTION_A_AUTH = "reception-a-auth-user";
    const RECEPTION_B_AUTH = "reception-b-auth-user";
    const SUPER_ADMIN_AUTH = "super-admin-auth-user";
    const HOSTEL_A = "hostel-a";
    const HOSTEL_B = "hostel-b";

    async function buildExpireTestApp(status: LeaveRequestStatus = "manual_verification") {
      const authDb = new FakeAuthDbPort()
        .addParent(PARENT_A_AUTH, PARENT_A_ID)
        .addStudent(STUDENT_AUTH, STUDENT_1_ID, null)
        .addStaff(RECEPTION_A_AUTH, "reception-a", "reception_warden", HOSTEL_A)
        .addStaff(RECEPTION_B_AUTH, "reception-b", "reception_warden", HOSTEL_B)
        .addStaff(SUPER_ADMIN_AUTH, "super-admin-1", "super_admin", null)
        .setActiveDevice(PARENT_A_ID, true);

      const leaveRepo = new FakeLeaveRepository()
        .addLeaveRequest(makeLeaveRequest("22222222-2222-2222-2222-222222222222", status))
        .linkStudentToHostel(STUDENT_1_ID, HOSTEL_A)
        .linkStaffToHostel("reception-a", HOSTEL_A)
        .linkStaffToHostel("reception-b", HOSTEL_B);

      const jwtVerifier = createJwtVerifier(
        { supabaseUrl: "http://127.0.0.1:9999" },
        async () => publicKey,
      );

      const app = await buildApp({
        authOverrides: { jwtVerifier, authDbPort: authDb },
        leaveOverrides: { leaveRepository: leaveRepo, biometricGate: freshGate },
        otpAuthOverrides: { otpSender: new FakeOtpSender() },
        staffOverrides: { staffRepository: new FakeStaffRepository() },
      });
      return { app };
    }

    const LEAVE_ID = "22222222-2222-2222-2222-222222222222";

    it("unauthenticated: 401", async () => {
      const { app } = await buildExpireTestApp();
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LEAVE_ID}/expire`,
      });
      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it("a parent (not staff) cannot mark expired: 403", async () => {
      const { app } = await buildExpireTestApp();
      const token = await tokenFor(PARENT_A_AUTH);
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LEAVE_ID}/expire`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it("the owning student cannot mark expired: 403", async () => {
      const { app } = await buildExpireTestApp();
      const token = await tokenFor(STUDENT_AUTH);
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LEAVE_ID}/expire`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it("library_incharge cannot mark expired: 403 (no leave_requests RLS grant for that role)", async () => {
      const authDb = new FakeAuthDbPort().addStaff(
        "library-auth",
        "library-1",
        "library_incharge",
        null,
      );
      const leaveRepo = new FakeLeaveRepository().addLeaveRequest(
        makeLeaveRequest(LEAVE_ID, "manual_verification"),
      );
      const jwtVerifier = createJwtVerifier(
        { supabaseUrl: "http://127.0.0.1:9999" },
        async () => publicKey,
      );
      const app = await buildApp({
        authOverrides: { jwtVerifier, authDbPort: authDb },
        leaveOverrides: { leaveRepository: leaveRepo, biometricGate: freshGate },
        otpAuthOverrides: { otpSender: new FakeOtpSender() },
        staffOverrides: { staffRepository: new FakeStaffRepository() },
      });
      const token = await tokenFor("library-auth");
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LEAVE_ID}/expire`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it("reception_warden in the SAME hostel, AAL2-verified: 200, status becomes expired", async () => {
      const { app } = await buildExpireTestApp("manual_verification");
      const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LEAVE_ID}/expire`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("expired");
      await app.close();
    });

    // Prompt 3 (RBAC & Authorization Framework) — closes the Prompt 0.3 ASRB
    // CRITICAL finding directly: a correctly-roled, correctly-hostel-scoped
    // staff member whose session never completed MFA (aal1 — e.g. a valid
    // JWT obtained via password sign-in alone) must still be rejected here,
    // regardless of what the frontend would have done. This is the one
    // concrete, previously-exploitable-in-principle path the finding named.
    it("reception_warden in the SAME hostel but AAL1 (MFA not completed): 403 insufficient_assurance, never 200", async () => {
      const { app } = await buildExpireTestApp("manual_verification");
      const token = await tokenFor(RECEPTION_A_AUTH); // no aal -> aal1-equivalent
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LEAVE_ID}/expire`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("insufficient_assurance");
      await app.close();
    });

    it("reception_warden in a DIFFERENT hostel: 404 (anti-enumeration, not a 403)", async () => {
      const { app } = await buildExpireTestApp("manual_verification");
      const token = await tokenFor(RECEPTION_B_AUTH, "aal2");
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LEAVE_ID}/expire`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it("super_admin: 200 regardless of hostel", async () => {
      const { app } = await buildExpireTestApp("manual_verification");
      const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LEAVE_ID}/expire`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("expired");
      await app.close();
    });

    it("wrong status (not manual_verification): 409, never silently accepted", async () => {
      const { app } = await buildExpireTestApp("father_notified");
      const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LEAVE_ID}/expire`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(409);
      await app.close();
    });
  });

  describe("POST /leave-requests/:id/send-for-parent-approval (Reception-Initiated Parent Approval correction — the only path out of pending)", () => {
    const RECEPTION_A_AUTH = "spa-reception-a-auth-user";
    const RECEPTION_B_AUTH = "spa-reception-b-auth-user";
    const SUPER_ADMIN_AUTH = "spa-super-admin-auth-user";
    const HOSTEL_A = "spa-hostel-a";
    const HOSTEL_B = "spa-hostel-b";
    const LEAVE_ID = "44444444-4444-4444-4444-444444444444";

    async function buildStartApprovalTestApp(status: LeaveRequestStatus = "pending") {
      const authDb = new FakeAuthDbPort()
        .addParent(PARENT_A_AUTH, PARENT_A_ID)
        .addStudent(STUDENT_AUTH, STUDENT_1_ID, null)
        .addStaff(RECEPTION_A_AUTH, "spa-reception-a", "reception_warden", HOSTEL_A)
        .addStaff(RECEPTION_B_AUTH, "spa-reception-b", "reception_warden", HOSTEL_B)
        .addStaff(SUPER_ADMIN_AUTH, "spa-super-admin-1", "super_admin", null)
        .setActiveDevice(PARENT_A_ID, true);

      const leaveRepo = new FakeLeaveRepository()
        .addLeaveRequest(makeLeaveRequest(LEAVE_ID, status))
        .linkParentToStudent(PARENT_A_ID, STUDENT_1_ID)
        .linkStudentToHostel(STUDENT_1_ID, HOSTEL_A)
        .linkStaffToHostel("spa-reception-a", HOSTEL_A)
        .linkStaffToHostel("spa-reception-b", HOSTEL_B);

      const jwtVerifier = createJwtVerifier(
        { supabaseUrl: "http://127.0.0.1:9999" },
        async () => publicKey,
      );

      const app = await buildApp({
        authOverrides: { jwtVerifier, authDbPort: authDb },
        leaveOverrides: { leaveRepository: leaveRepo, biometricGate: freshGate },
        otpAuthOverrides: { otpSender: new FakeOtpSender() },
        staffOverrides: { staffRepository: new FakeStaffRepository() },
      });
      return { app, leaveRepo };
    }

    it("unauthenticated: 401", async () => {
      const { app } = await buildStartApprovalTestApp();
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LEAVE_ID}/send-for-parent-approval`,
      });
      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it("a parent (not staff) cannot start parent approval: 403", async () => {
      const { app } = await buildStartApprovalTestApp();
      const token = await tokenFor(PARENT_A_AUTH);
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LEAVE_ID}/send-for-parent-approval`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it("the owning student cannot start parent approval: 403", async () => {
      const { app } = await buildStartApprovalTestApp();
      const token = await tokenFor(STUDENT_AUTH);
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LEAVE_ID}/send-for-parent-approval`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it("library_incharge cannot start parent approval: 403 (no leave_requests RLS grant for that role)", async () => {
      const authDb = new FakeAuthDbPort().addStaff(
        "spa-library-auth",
        "spa-library-1",
        "library_incharge",
        null,
      );
      const leaveRepo = new FakeLeaveRepository().addLeaveRequest(
        makeLeaveRequest(LEAVE_ID, "pending"),
      );
      const jwtVerifier = createJwtVerifier(
        { supabaseUrl: "http://127.0.0.1:9999" },
        async () => publicKey,
      );
      const app = await buildApp({
        authOverrides: { jwtVerifier, authDbPort: authDb },
        leaveOverrides: { leaveRepository: leaveRepo, biometricGate: freshGate },
        otpAuthOverrides: { otpSender: new FakeOtpSender() },
        staffOverrides: { staffRepository: new FakeStaffRepository() },
      });
      const token = await tokenFor("spa-library-auth", "aal2");
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LEAVE_ID}/send-for-parent-approval`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it("reception_warden in the SAME hostel, AAL2-verified: 200, status becomes father_notified", async () => {
      const { app } = await buildStartApprovalTestApp("pending");
      const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LEAVE_ID}/send-for-parent-approval`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("father_notified");
      await app.close();
    });

    it("reception_warden in the SAME hostel but AAL1 (MFA not completed): 403 insufficient_assurance, never 200", async () => {
      const { app } = await buildStartApprovalTestApp("pending");
      const token = await tokenFor(RECEPTION_A_AUTH); // no aal -> aal1-equivalent
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LEAVE_ID}/send-for-parent-approval`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("insufficient_assurance");
      await app.close();
    });

    it("reception_warden in a DIFFERENT hostel: 404 (anti-enumeration, not a 403)", async () => {
      const { app } = await buildStartApprovalTestApp("pending");
      const token = await tokenFor(RECEPTION_B_AUTH, "aal2");
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LEAVE_ID}/send-for-parent-approval`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it("super_admin: 200 regardless of hostel", async () => {
      const { app } = await buildStartApprovalTestApp("pending");
      const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LEAVE_ID}/send-for-parent-approval`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("father_notified");
      await app.close();
    });

    it("nonexistent leave request: 404, same anti-enumeration shape as /expire", async () => {
      const { app } = await buildStartApprovalTestApp("pending");
      const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/leave-requests/99999999-9999-9999-9999-999999999999/send-for-parent-approval",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it("already started / non-pending: 409 conflict, never silently re-accepted — covers a second click after approval already started", async () => {
      const { app } = await buildStartApprovalTestApp("father_notified");
      const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LEAVE_ID}/send-for-parent-approval`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.currentStatus).toBe("father_notified");
      await app.close();
    });

    it("a terminal request (already approved) cannot have parent approval re-started: 409", async () => {
      const { app } = await buildStartApprovalTestApp("approved");
      const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LEAVE_ID}/send-for-parent-approval`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(409);
      await app.close();
    });

    it("concurrent duplicate calls on the same pending request: exactly one succeeds", async () => {
      const { app } = await buildStartApprovalTestApp("pending");
      const token = await tokenFor(RECEPTION_A_AUTH, "aal2");

      const [resA, resB] = await Promise.all([
        app.inject({
          method: "POST",
          url: `/api/v1/leave-requests/${LEAVE_ID}/send-for-parent-approval`,
          headers: { authorization: `Bearer ${token}` },
        }),
        app.inject({
          method: "POST",
          url: `/api/v1/leave-requests/${LEAVE_ID}/send-for-parent-approval`,
          headers: { authorization: `Bearer ${token}` },
        }),
      ]);

      const statusCodes = [resA.statusCode, resB.statusCode].sort();
      expect(statusCodes).toEqual([200, 409]);
      await app.close();
    });
  });

  describe("POST /leave-requests/:id/exit-authorization (Phase 3, Prompt 7C — Student Verification & Exit Authorization)", () => {
    const RECEPTION_A_AUTH = "xa-reception-a-auth-user";
    const RECEPTION_B_AUTH = "xa-reception-b-auth-user";
    const SUPER_ADMIN_AUTH = "xa-super-admin-auth-user";
    const HOSTEL_A = "xa-hostel-a";
    const HOSTEL_B = "xa-hostel-b";
    const LEAVE_ID = "77777777-7777-7777-7777-777777777777";

    async function buildExitAuthTestApp(status: LeaveRequestStatus = "approved") {
      const authDb = new FakeAuthDbPort()
        .addParent(PARENT_A_AUTH, PARENT_A_ID)
        .addStudent(STUDENT_AUTH, STUDENT_1_ID, null)
        .addStaff(RECEPTION_A_AUTH, "xa-reception-a", "reception_warden", HOSTEL_A)
        .addStaff(RECEPTION_B_AUTH, "xa-reception-b", "reception_warden", HOSTEL_B)
        .addStaff(SUPER_ADMIN_AUTH, "xa-super-admin-1", "super_admin", null)
        .setActiveDevice(PARENT_A_ID, true);

      const leaveRepo = new FakeLeaveRepository()
        .addLeaveRequest(makeLeaveRequest(LEAVE_ID, status))
        .linkParentToStudent(PARENT_A_ID, STUDENT_1_ID)
        .linkStudentToHostel(STUDENT_1_ID, HOSTEL_A)
        .linkStaffToHostel("xa-reception-a", HOSTEL_A)
        .linkStaffToHostel("xa-reception-b", HOSTEL_B);

      const jwtVerifier = createJwtVerifier(
        { supabaseUrl: "http://127.0.0.1:9999" },
        async () => publicKey,
      );

      const app = await buildApp({
        authOverrides: { jwtVerifier, authDbPort: authDb },
        leaveOverrides: { leaveRepository: leaveRepo, biometricGate: freshGate },
        otpAuthOverrides: { otpSender: new FakeOtpSender() },
        staffOverrides: { staffRepository: new FakeStaffRepository() },
      });
      return { app, leaveRepo };
    }

    it("unauthenticated: 401", async () => {
      const { app } = await buildExitAuthTestApp();
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LEAVE_ID}/exit-authorization`,
        payload: { identityConfirmed: true },
      });
      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it("a parent (not staff) cannot authorize an exit: 403", async () => {
      const { app } = await buildExitAuthTestApp();
      const token = await tokenFor(PARENT_A_AUTH);
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LEAVE_ID}/exit-authorization`,
        headers: { authorization: `Bearer ${token}` },
        payload: { identityConfirmed: true },
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it("the owning student cannot authorize their own exit: 403", async () => {
      const { app } = await buildExitAuthTestApp();
      const token = await tokenFor(STUDENT_AUTH);
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LEAVE_ID}/exit-authorization`,
        headers: { authorization: `Bearer ${token}` },
        payload: { identityConfirmed: true },
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it("library_incharge cannot authorize an exit: 403 (no leave_requests RLS grant for that role)", async () => {
      const authDb = new FakeAuthDbPort().addStaff(
        "xa-library-auth",
        "xa-library-1",
        "library_incharge",
        null,
      );
      const leaveRepo = new FakeLeaveRepository().addLeaveRequest(
        makeLeaveRequest(LEAVE_ID, "approved"),
      );
      const jwtVerifier = createJwtVerifier(
        { supabaseUrl: "http://127.0.0.1:9999" },
        async () => publicKey,
      );
      const app = await buildApp({
        authOverrides: { jwtVerifier, authDbPort: authDb },
        leaveOverrides: { leaveRepository: leaveRepo, biometricGate: freshGate },
        otpAuthOverrides: { otpSender: new FakeOtpSender() },
        staffOverrides: { staffRepository: new FakeStaffRepository() },
      });
      const token = await tokenFor("xa-library-auth", "aal2");
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LEAVE_ID}/exit-authorization`,
        headers: { authorization: `Bearer ${token}` },
        payload: { identityConfirmed: true },
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it("reception_warden in the SAME hostel, AAL2-verified, identityConfirmed=true: 201, exit recorded", async () => {
      const { app } = await buildExitAuthTestApp("approved");
      const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LEAVE_ID}/exit-authorization`,
        headers: { authorization: `Bearer ${token}` },
        payload: { identityConfirmed: true },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().leaveRequestId).toBe(LEAVE_ID);
      expect(res.json().identityConfirmed).toBe(true);
      await app.close();
    });

    it("reception_warden in the SAME hostel but AAL1 (MFA not completed): 403 insufficient_assurance, never 201", async () => {
      const { app } = await buildExitAuthTestApp("approved");
      const token = await tokenFor(RECEPTION_A_AUTH); // no aal -> aal1-equivalent
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LEAVE_ID}/exit-authorization`,
        headers: { authorization: `Bearer ${token}` },
        payload: { identityConfirmed: true },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("insufficient_assurance");
      await app.close();
    });

    it("reception_warden in a DIFFERENT hostel: 404 (anti-enumeration, not a 403)", async () => {
      const { app } = await buildExitAuthTestApp("approved");
      const token = await tokenFor(RECEPTION_B_AUTH, "aal2");
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LEAVE_ID}/exit-authorization`,
        headers: { authorization: `Bearer ${token}` },
        payload: { identityConfirmed: true },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it("super_admin: 201 regardless of hostel", async () => {
      const { app } = await buildExitAuthTestApp("approved");
      const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LEAVE_ID}/exit-authorization`,
        headers: { authorization: `Bearer ${token}` },
        payload: { identityConfirmed: true },
      });
      expect(res.statusCode).toBe(201);
      await app.close();
    });

    it("nonexistent leave request: 404, same anti-enumeration shape as /expire and /send-for-parent-approval", async () => {
      const { app } = await buildExitAuthTestApp("approved");
      const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/leave-requests/99999999-9999-9999-9999-999999999999/exit-authorization",
        headers: { authorization: `Bearer ${token}` },
        payload: { identityConfirmed: true },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it.each(["pending", "father_notified", "manual_verification", "rejected", "expired"] as const)(
      "leave request not yet approved (%s): 409 conflict, never silently accepted",
      async (status) => {
        const { app } = await buildExitAuthTestApp(status);
        const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
        const res = await app.inject({
          method: "POST",
          url: `/api/v1/leave-requests/${LEAVE_ID}/exit-authorization`,
          headers: { authorization: `Bearer ${token}` },
          payload: { identityConfirmed: true },
        });
        expect(res.statusCode).toBe(409);
        expect(res.json().error.currentStatus).toBe(status);
        await app.close();
      },
    );

    it("already-authorized exit: repeat call is 409 conflict, not a duplicate record", async () => {
      const { app } = await buildExitAuthTestApp("approved");
      const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
      const first = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LEAVE_ID}/exit-authorization`,
        headers: { authorization: `Bearer ${token}` },
        payload: { identityConfirmed: true },
      });
      expect(first.statusCode).toBe(201);

      const second = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LEAVE_ID}/exit-authorization`,
        headers: { authorization: `Bearer ${token}` },
        payload: { identityConfirmed: true },
      });
      expect(second.statusCode).toBe(409);
      await app.close();
    });

    it("concurrent duplicate calls on the same approved request: exactly one succeeds", async () => {
      const { app } = await buildExitAuthTestApp("approved");
      const token = await tokenFor(RECEPTION_A_AUTH, "aal2");

      const [resA, resB] = await Promise.all([
        app.inject({
          method: "POST",
          url: `/api/v1/leave-requests/${LEAVE_ID}/exit-authorization`,
          headers: { authorization: `Bearer ${token}` },
          payload: { identityConfirmed: true },
        }),
        app.inject({
          method: "POST",
          url: `/api/v1/leave-requests/${LEAVE_ID}/exit-authorization`,
          headers: { authorization: `Bearer ${token}` },
          payload: { identityConfirmed: true },
        }),
      ]);

      const statusCodes = [resA.statusCode, resB.statusCode].sort();
      expect(statusCodes).toEqual([201, 409]);
      await app.close();
    });

    it("identityConfirmed: false -> 400, never silently treated as confirmed", async () => {
      const { app } = await buildExitAuthTestApp("approved");
      const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LEAVE_ID}/exit-authorization`,
        headers: { authorization: `Bearer ${token}` },
        payload: { identityConfirmed: false },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("missing identityConfirmed field -> 400", async () => {
      const { app } = await buildExitAuthTestApp("approved");
      const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LEAVE_ID}/exit-authorization`,
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    // Adversarial client input: a forged role/hostelId/staffId/studentId/
    // parentId/mentorApproved/parentApproved/authorizationStatus/
    // exitTimestamp in the body must have zero effect — the route's
    // `.strict()` schema doesn't even parse them, and every real
    // authorization decision is resolved server-side from the authenticated
    // caller's own staff profile, never from request body content.
    it("forged client-supplied identity/authorization fields in the body have no effect — still 400 (unrecognized fields rejected) or resolved purely server-side", async () => {
      const { app } = await buildExitAuthTestApp("approved");
      const token = await tokenFor(RECEPTION_B_AUTH, "aal2"); // wrong hostel
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/leave-requests/${LEAVE_ID}/exit-authorization`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          identityConfirmed: true,
          role: "super_admin",
          hostelId: HOSTEL_A,
          staffId: "xa-reception-a",
          studentId: STUDENT_1_ID,
          parentId: PARENT_A_ID,
          mentorApproved: true,
          parentApproved: true,
          authorizationStatus: "AUTHORIZED",
          exitTimestamp: "2020-01-01T00:00:00.000Z",
        },
      });
      // .strict() rejects the unrecognized fields outright (400) — proving
      // there is no code path where they could ever be parsed, let alone
      // used to bypass the still-wrong-hostel authorization check below.
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  describe("GET /leave-requests/queue (Reception Dashboard, Phase 3 Prompt 7A — staff-only, hostel-scoped)", () => {
    const RECEPTION_A_AUTH = "queue-reception-a-auth";
    const RECEPTION_B_AUTH = "queue-reception-b-auth";
    const HOSTEL_ADMIN_A_AUTH = "queue-hostel-admin-a-auth";
    const SUPER_ADMIN_AUTH = "queue-super-admin-auth";
    const LIBRARY_AUTH = "queue-library-auth";
    const HOSTEL_A = "queue-hostel-a";
    const HOSTEL_B = "queue-hostel-b";
    const STUDENT_A_ID = "queue-student-a";
    const STUDENT_B_ID = "queue-student-b";
    const REQUEST_A_OLDER = "33333333-3333-3333-3333-333333333331";
    const REQUEST_A_NEWER = "33333333-3333-3333-3333-333333333332";
    const REQUEST_B = "33333333-3333-3333-3333-333333333333";

    async function buildQueueTestApp() {
      const authDb = new FakeAuthDbPort()
        .addParent(PARENT_A_AUTH, PARENT_A_ID)
        .addStudent(STUDENT_AUTH, STUDENT_1_ID, null)
        .addStaff(RECEPTION_A_AUTH, "queue-reception-a", "reception_warden", HOSTEL_A)
        .addStaff(RECEPTION_B_AUTH, "queue-reception-b", "reception_warden", HOSTEL_B)
        .addStaff(HOSTEL_ADMIN_A_AUTH, "queue-hostel-admin-a", "hostel_admin", HOSTEL_A)
        .addStaff(SUPER_ADMIN_AUTH, "queue-super-admin", "super_admin", null)
        .addStaff(LIBRARY_AUTH, "queue-library", "library_incharge", null);

      const older = makeLeaveRequest(REQUEST_A_OLDER, "pending");
      const newer = makeLeaveRequest(REQUEST_A_NEWER, "father_notified");
      const otherHostel = makeLeaveRequest(REQUEST_B, "pending");
      older.studentId = STUDENT_A_ID;
      older.createdAt = new Date("2026-01-01T00:00:00.000Z").toISOString();
      newer.studentId = STUDENT_A_ID;
      newer.createdAt = new Date("2026-01-02T00:00:00.000Z").toISOString();
      otherHostel.studentId = STUDENT_B_ID;
      otherHostel.createdAt = new Date("2026-01-03T00:00:00.000Z").toISOString();

      const leaveRepo = new FakeLeaveRepository()
        .addLeaveRequest(older)
        .addLeaveRequest(newer)
        .addLeaveRequest(otherHostel)
        .linkStudentToHostel(STUDENT_A_ID, HOSTEL_A)
        .linkStudentToHostel(STUDENT_B_ID, HOSTEL_B)
        .linkStaffToHostel("queue-reception-a", HOSTEL_A)
        .linkStaffToHostel("queue-reception-b", HOSTEL_B)
        .linkStaffToHostel("queue-hostel-admin-a", HOSTEL_A)
        .addStudentInfo(STUDENT_A_ID, {
          rollNumber: "Q-001",
          fullName: "Queue Student A",
          hostelId: HOSTEL_A,
          hostelName: "Hostel A",
          roomId: "room-a",
          roomNumber: "101",
        })
        .addStudentInfo(STUDENT_B_ID, {
          rollNumber: "Q-002",
          fullName: "Queue Student B",
          hostelId: HOSTEL_B,
          hostelName: "Hostel B",
          roomId: "room-b",
          roomNumber: "201",
        });

      const jwtVerifier = createJwtVerifier(
        { supabaseUrl: "http://127.0.0.1:9999" },
        async () => publicKey,
      );

      const app = await buildApp({
        authOverrides: { jwtVerifier, authDbPort: authDb },
        leaveOverrides: { leaveRepository: leaveRepo, biometricGate: freshGate },
        otpAuthOverrides: { otpSender: new FakeOtpSender() },
        staffOverrides: { staffRepository: new FakeStaffRepository() },
      });
      return { app };
    }

    it("unauthenticated: 401", async () => {
      const { app } = await buildQueueTestApp();
      const res = await app.inject({ method: "GET", url: "/api/v1/leave-requests/queue" });
      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it("a parent (not staff) cannot list the queue: 403", async () => {
      const { app } = await buildQueueTestApp();
      const token = await tokenFor(PARENT_A_AUTH, "aal2");
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/leave-requests/queue",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it("a student cannot list the queue: 403", async () => {
      const { app } = await buildQueueTestApp();
      const token = await tokenFor(STUDENT_AUTH, "aal2");
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/leave-requests/queue",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it("library_incharge cannot list the queue: 403 (no leave_requests RLS grant for that role)", async () => {
      const { app } = await buildQueueTestApp();
      const token = await tokenFor(LIBRARY_AUTH, "aal2");
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/leave-requests/queue",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it("reception_warden with a valid role but AAL1 (MFA not completed): 403 insufficient_assurance, never 200", async () => {
      const { app } = await buildQueueTestApp();
      const token = await tokenFor(RECEPTION_A_AUTH); // no aal -> aal1-equivalent
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/leave-requests/queue",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("insufficient_assurance");
      await app.close();
    });

    it("reception_warden, AAL2-verified: sees only their own hostel's requests, newest first", async () => {
      const { app } = await buildQueueTestApp();
      const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/leave-requests/queue",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.map((item: { id: string }) => item.id)).toEqual([
        REQUEST_A_NEWER,
        REQUEST_A_OLDER,
      ]);
      // Enrichment: real student/hostel/room fields, never fabricated.
      expect(body[0].studentRollNumber).toBe("Q-001");
      expect(body[0].studentFullName).toBe("Queue Student A");
      expect(body[0].studentHostelName).toBe("Hostel A");
      expect(body[0].studentRoomNumber).toBe("101");
      await app.close();
    });

    it("hostel_admin, AAL2-verified: sees only their own hostel's requests (same scoping as reception_warden)", async () => {
      const { app } = await buildQueueTestApp();
      const token = await tokenFor(HOSTEL_ADMIN_A_AUTH, "aal2");
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/leave-requests/queue",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.map((item: { id: string }) => item.id).sort()).toEqual(
        [REQUEST_A_NEWER, REQUEST_A_OLDER].sort(),
      );
      await app.close();
    });

    it("reception_warden in a DIFFERENT hostel: sees only that hostel's request, never the other hostel's data — no cross-hostel leak", async () => {
      const { app } = await buildQueueTestApp();
      const token = await tokenFor(RECEPTION_B_AUTH, "aal2");
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/leave-requests/queue",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.map((item: { id: string }) => item.id)).toEqual([REQUEST_B]);
      await app.close();
    });

    it("super_admin: sees every hostel's requests, unscoped", async () => {
      const { app } = await buildQueueTestApp();
      const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/leave-requests/queue",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveLength(3);
      await app.close();
    });

    it("a role query parameter cannot broaden a reception_warden's scope (server-resolved role/hostel, never client-supplied)", async () => {
      const { app } = await buildQueueTestApp();
      const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/leave-requests/queue?role=super_admin&hostelId=queue-hostel-b",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.map((item: { id: string }) => item.id)).toEqual([
        REQUEST_A_NEWER,
        REQUEST_A_OLDER,
      ]);
      await app.close();
    });
  });
});
