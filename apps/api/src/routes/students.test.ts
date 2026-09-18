import { describe, it, expect, beforeAll } from "vitest";
import type { KeyLike } from "jose";
import { buildApp } from "../app.js";
import { FakeAuthDbPort } from "../lib/auth/__fixtures__/fake-db-port.js";
import { generateTestKeyPair, signTestJwt } from "../lib/auth/__fixtures__/test-jwt.js";
import { createJwtVerifier } from "../lib/auth/jwt.js";
import { FakeStudentRepository } from "../domain/student/__fixtures__/fake-repository.js";
import { FakeOtpSender } from "../domain/auth/__fixtures__/fake-otp-sender.js";
import { FakeStaffRepository } from "../domain/staff/__fixtures__/fake-repository.js";

describe("student routes (end-to-end through the real app)", () => {
  let privateKey: KeyLike;
  let publicKey: KeyLike;

  const PARENT_AUTH = "students-parent-auth";
  const STUDENT_AUTH = "students-student-auth";
  const RECEPTION_A_AUTH = "students-reception-a-auth";
  const RECEPTION_B_AUTH = "students-reception-b-auth";
  const HOSTEL_ADMIN_A_AUTH = "students-hostel-admin-a-auth";
  const SUPER_ADMIN_AUTH = "students-super-admin-auth";
  const LIBRARY_AUTH = "students-library-auth";
  const RECEPTION_A_STAFF_ID = "students-reception-a";
  const RECEPTION_B_STAFF_ID = "students-reception-b";
  const HOSTEL_A = "students-hostel-a";
  const HOSTEL_B = "students-hostel-b";

  beforeAll(async () => {
    const pair = await generateTestKeyPair();
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;
  });

  async function buildTestApp() {
    const authDb = new FakeAuthDbPort()
      .addParent(PARENT_AUTH, "parent-1")
      .addStudent(STUDENT_AUTH, "student-1", null)
      .addStaff(RECEPTION_A_AUTH, RECEPTION_A_STAFF_ID, "reception_warden", HOSTEL_A)
      .addStaff(RECEPTION_B_AUTH, RECEPTION_B_STAFF_ID, "reception_warden", HOSTEL_B)
      .addStaff(HOSTEL_ADMIN_A_AUTH, "students-hostel-admin-a", "hostel_admin", HOSTEL_A)
      .addStaff(SUPER_ADMIN_AUTH, "students-super-admin", "super_admin", null)
      .addStaff(LIBRARY_AUTH, "students-library", "library_incharge", null);

    const studentRepo = new FakeStudentRepository();
    studentRepo.staffHostels.set(RECEPTION_A_STAFF_ID, HOSTEL_A);
    studentRepo.staffHostels.set("students-hostel-admin-a", HOSTEL_A);
    studentRepo.staffHostels.set(RECEPTION_B_STAFF_ID, HOSTEL_B);
    studentRepo.students.push(
      {
        id: "student-a1",
        rollNumber: "SA001",
        fullName: "Anita Kumar",
        hostelId: HOSTEL_A,
        hostelName: "Hostel A",
        roomId: "room-a1",
        roomNumber: "101",
      },
      {
        id: "student-b1",
        rollNumber: "SB001",
        fullName: "Binay Roy",
        hostelId: HOSTEL_B,
        hostelName: "Hostel B",
        roomId: "room-b1",
        roomNumber: "201",
      },
    );

    const jwtVerifier = createJwtVerifier(
      { supabaseUrl: "http://127.0.0.1:9999" },
      async () => publicKey,
    );

    const app = await buildApp({
      authOverrides: { jwtVerifier, authDbPort: authDb },
      studentOverrides: { studentRepository: studentRepo },
      otpAuthOverrides: { otpSender: new FakeOtpSender() },
      staffOverrides: { staffRepository: new FakeStaffRepository() },
    });
    return { app };
  }

  async function tokenFor(sub: string, aal?: string) {
    return signTestJwt({ sub, privateKey, aal });
  }

  describe("GET /students (search)", () => {
    it("unauthenticated: 401", async () => {
      const { app } = await buildTestApp();
      const res = await app.inject({ method: "GET", url: "/api/v1/students" });
      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it("a parent (not staff): 403 role_required", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(PARENT_AUTH);
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/students",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("role_required");
      await app.close();
    });

    it("a student (not staff): 403 role_required", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(STUDENT_AUTH);
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/students",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it("library_incharge (staff, but no grant on this route): 403 role_required", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(LIBRARY_AUTH);
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/students",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it("reception, AAL1 (no MFA): 403 insufficient_assurance", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(RECEPTION_A_AUTH); // no aal claim
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/students",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("insufficient_assurance");
      await app.close();
    });

    it("reception (Hostel A), AAL2: sees only Hostel A students", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/students",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items.map((i: { rollNumber: string }) => i.rollNumber)).toEqual(["SA001"]);
      await app.close();
    });

    it("reception (Hostel B), AAL2: never sees Hostel A students", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(RECEPTION_B_AUTH, "aal2");
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/students",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items.map((i: { rollNumber: string }) => i.rollNumber)).toEqual(["SB001"]);
      await app.close();
    });

    it("super_admin, AAL2: sees every hostel's students", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/students",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().total).toBe(2);
      await app.close();
    });

    it("query search: matches by name prefix", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/students?q=ani",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().items).toHaveLength(1);
      await app.close();
    });

    it("invalid pageSize (0): 400 validation_failed", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/students?pageSize=0",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("invalid pageSize (over the max of 50): 400 validation_failed", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/students?pageSize=500",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("manipulated client-supplied scope field (hostelId as an extra query param): 400, strict schema rejects it outright — never silently accepted or used for scoping", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(RECEPTION_B_AUTH, "aal2");
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/students?hostelId=" + HOSTEL_A,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  describe("GET /students/:rollNumber (profile)", () => {
    it("unauthenticated: 401", async () => {
      const { app } = await buildTestApp();
      const res = await app.inject({ method: "GET", url: "/api/v1/students/SA001" });
      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it("reception (Hostel A), AAL2: own-hostel student resolves", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/students/SA001",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().fullName).toBe("Anita Kumar");
      await app.close();
    });

    it("reception (Hostel B), AAL2: cross-hostel student -> 404 (anti-enumeration)", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(RECEPTION_B_AUTH, "aal2");
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/students/SA001",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it("nonexistent roll number -> the identical 404 (same error code as cross-hostel)", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
      const crossHostelRes = await app.inject({
        method: "GET",
        url: "/api/v1/students/SB001",
        headers: { authorization: `Bearer ${token}` },
      });
      const nonexistentRes = await app.inject({
        method: "GET",
        url: "/api/v1/students/DOES-NOT-EXIST",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(crossHostelRes.statusCode).toBe(404);
      expect(nonexistentRes.statusCode).toBe(404);
      expect(crossHostelRes.json().error.code).toBe(nonexistentRes.json().error.code);
      await app.close();
    });

    it("reception, AAL1 (no MFA): 403 insufficient_assurance", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(RECEPTION_A_AUTH);
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/students/SA001",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it("super_admin, AAL2: resolves any hostel's student", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(SUPER_ADMIN_AUTH, "aal2");
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/students/SB001",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().fullName).toBe("Binay Roy");
      await app.close();
    });

    it("a profile response never includes an internal id field beyond the documented shape (data minimization)", async () => {
      const { app } = await buildTestApp();
      const token = await tokenFor(RECEPTION_A_AUTH, "aal2");
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/students/SA001",
        headers: { authorization: `Bearer ${token}` },
      });
      const body = res.json();
      expect(Object.keys(body).sort()).toEqual(
        [
          "currentLeave",
          "fullName",
          "guardians",
          "hostelId",
          "hostelName",
          "hostelPresence",
          "id",
          "roomId",
          "roomNumber",
          "rollNumber",
          "timeline",
        ].sort(),
      );
      await app.close();
    });
  });
});
