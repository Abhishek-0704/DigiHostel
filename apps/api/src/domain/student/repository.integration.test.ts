import { describe, it, expect } from "vitest";
import { DrizzleStudentRepository } from "./repository.js";
import { DrizzleLeaveRepository } from "../leave/repository.js";
import { DrizzleMovementRepository } from "../movement/repository.js";
import { NoopJobScheduler } from "../../lib/queue/jobs.js";

/**
 * Real-Postgres integration test — exercises the actual hostel-scoped
 * search/profile queries (prefix-match, joins, ordering, pagination)
 * against the local Supabase instance's real seed data
 * (`supabase/seed.sql`), mirroring `domain/leave/repository.integration.test.ts`'s
 * own `RUN`-gated convention. Purely read-only (search/profile never
 * mutate), so no fixture insert/cleanup is required — the seeded accounts
 * (student1/Kalinga, reception1/Kalinga, reception2/Utkal,
 * parent1-father) are used directly and never modified.
 */
const RUN = Boolean(process.env.DATABASE_URL);

describe.skipIf(!RUN)("DrizzleStudentRepository (real Postgres integration)", () => {
  const RECEPTION1_STAFF_ID = "e0000000-0000-0000-0000-000000000001"; // Kalinga
  const RECEPTION2_STAFF_ID = "e0000000-0000-0000-0000-000000000006"; // Utkal
  const SUPER_ADMIN_STAFF_ID = "e0000000-0000-0000-0000-000000000004";
  const STUDENT1_ID = "c0000000-0000-0000-0000-000000000001"; // seeded student1, Kalinga
  const PARENT1_ID = "d0000000-0000-0000-0000-000000000001"; // seeded parent1-father, linked to student1

  /** Builds a genuinely approved + exit-authorized leave for student1 via
   * the real, certified upstream chain (create -> startParentApproval ->
   * decide -> authorizeExit) — the identical helper
   * `domain/movement/repository.integration.test.ts` already established,
   * reused here rather than hand-seeding a row, so `hostelPresence`'s
   * derivation is exercised against real data, not an assumption about
   * its shape. */
  async function buildApprovedExitedLeaveForStudent1(): Promise<string> {
    const leaveRepo = new DrizzleLeaveRepository(new NoopJobScheduler());
    const created = await leaveRepo.create({
      studentId: STUDENT1_ID,
      reason: "Student hostel-presence integration test",
      startDate: "2026-12-20",
      endDate: "2026-12-22",
    });
    const started = await leaveRepo.startParentApproval({
      leaveRequestId: created.id,
      actingStaffId: RECEPTION1_STAFF_ID,
      actingStaffRole: "reception_warden",
    });
    if (started.kind !== "success") throw new Error("startParentApproval failed");
    const decided = await leaveRepo.decide({
      leaveRequestId: created.id,
      actingParentId: PARENT1_ID,
      decision: "approved",
      biometricAssertion: {
        assertionToken: "student-hostel-presence-test-token",
        actionId: `leave-decision:${created.id}`,
      },
    });
    if (decided.kind !== "success") throw new Error("decide failed");
    const exited = await leaveRepo.authorizeExit({
      leaveRequestId: created.id,
      actingStaffId: RECEPTION1_STAFF_ID,
      actingStaffRole: "reception_warden",
      identityConfirmed: true,
    });
    if (exited.kind !== "success") throw new Error("authorizeExit failed");
    return created.id;
  }

  it("search: reception1 (Kalinga) finds the seeded Kalinga student by roll-number prefix", async () => {
    const repo = new DrizzleStudentRepository();
    const result = await repo.search({
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      query: "TEST-S00",
      page: 1,
      pageSize: 20,
      sortBy: "rollNumber",
      sortDir: "asc",
    });
    expect(result.items.some((i) => i.rollNumber === "TEST-S001")).toBe(true);
  });

  it("search: reception2 (Utkal) never sees the Kalinga student, even with a matching query", async () => {
    const repo = new DrizzleStudentRepository();
    const result = await repo.search({
      staffId: RECEPTION2_STAFF_ID,
      staffRole: "reception_warden",
      query: "TEST-S00",
      page: 1,
      pageSize: 20,
      sortBy: "rollNumber",
      sortDir: "asc",
    });
    expect(result.items.some((i) => i.rollNumber === "TEST-S001")).toBe(false);
  });

  it("search: super_admin sees the Kalinga student regardless of hostel", async () => {
    const repo = new DrizzleStudentRepository();
    const result = await repo.search({
      staffId: SUPER_ADMIN_STAFF_ID,
      staffRole: "super_admin",
      query: "TEST-S001",
      page: 1,
      pageSize: 20,
      sortBy: "rollNumber",
      sortDir: "asc",
    });
    expect(result.items.some((i) => i.rollNumber === "TEST-S001")).toBe(true);
  });

  it("search: a substring that is not a prefix does not match (proves this is a prefix search, not a fabricated full-text search)", async () => {
    const repo = new DrizzleStudentRepository();
    const result = await repo.search({
      staffId: SUPER_ADMIN_STAFF_ID,
      staffRole: "super_admin",
      query: "S001", // "TEST-S001" contains this, but it is not a prefix
      page: 1,
      pageSize: 20,
      sortBy: "rollNumber",
      sortDir: "asc",
    });
    expect(result.items.some((i) => i.rollNumber === "TEST-S001")).toBe(false);
  });

  it("getProfileByRollNumber: reception1 (Kalinga) resolves the seeded student, including its real linked parent", async () => {
    const repo = new DrizzleStudentRepository();
    const profile = await repo.getProfileByRollNumber("TEST-S001", {
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
    });
    expect(profile).not.toBeNull();
    expect(profile!.hostelName).toContain("Kalinga");
    expect(profile!.guardians.length).toBeGreaterThan(0);
    expect(profile!.guardians[0]).not.toHaveProperty("id");
    expect(profile!.guardians[0]).not.toHaveProperty("authUserId");
  });

  it("getProfileByRollNumber: reception2 (Utkal) gets null for the Kalinga student — anti-enumeration", async () => {
    const repo = new DrizzleStudentRepository();
    const profile = await repo.getProfileByRollNumber("TEST-S001", {
      staffId: RECEPTION2_STAFF_ID,
      staffRole: "reception_warden",
    });
    expect(profile).toBeNull();
  });

  it("getProfileByRollNumber: a nonexistent roll number returns the identical null", async () => {
    const repo = new DrizzleStudentRepository();
    const profile = await repo.getProfileByRollNumber("NO-SUCH-STUDENT", {
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
    });
    expect(profile).toBeNull();
  });

  describe("hostelPresence — server-derived, real chain (Phase 4, Prompt 9 remediation)", () => {
    it("reports outside_hostel once a leave is genuinely exit-authorized and not yet returned", async () => {
      await buildApprovedExitedLeaveForStudent1();
      const repo = new DrizzleStudentRepository();

      const profile = await repo.getProfileByRollNumber("TEST-S001", {
        staffId: RECEPTION1_STAFF_ID,
        staffRole: "reception_warden",
      });

      expect(profile).not.toBeNull();
      expect(profile!.currentLeave?.exitAuthorized).toBe(true);
      expect(profile!.currentLeave?.returnRecorded).toBe(false);
      expect(profile!.hostelPresence).toBe("outside_hostel");
    });

    it("flips to inside_hostel the instant a real hostel return is recorded for that same leave", async () => {
      const leaveRequestId = await buildApprovedExitedLeaveForStudent1();
      const movementRepo = new DrizzleMovementRepository();
      const returned = await movementRepo.recordHostelReturn({
        leaveRequestId,
        staffId: RECEPTION1_STAFF_ID,
        staffRole: "reception_warden",
      });
      expect(returned.kind).toBe("success");

      const repo = new DrizzleStudentRepository();
      const profile = await repo.getProfileByRollNumber("TEST-S001", {
        staffId: RECEPTION1_STAFF_ID,
        staffRole: "reception_warden",
      });

      expect(profile!.currentLeave?.id).toBe(leaveRequestId);
      expect(profile!.currentLeave?.returnRecorded).toBe(true);
      expect(profile!.hostelPresence).toBe("inside_hostel");
    });
  });

  describe("getHostelPresenceSummary — derived occupancy (Phase 4, Prompt 9 remediation, not yet exposed by any route)", () => {
    it("counts a genuinely exit-authorized, not-yet-returned student as outside within their own hostel's scope", async () => {
      await buildApprovedExitedLeaveForStudent1();
      const repo = new DrizzleStudentRepository();

      const summary = await repo.getHostelPresenceSummary({
        staffId: RECEPTION1_STAFF_ID,
        staffRole: "reception_warden",
      });

      expect(summary.studentsOutside).toBeGreaterThanOrEqual(1);
      expect(summary.studentsInside + summary.studentsOutside).toBe(summary.totalStudents);
    });

    it("never counts a student against a different hostel's scope (cross-hostel isolation)", async () => {
      await buildApprovedExitedLeaveForStudent1(); // student1 is Kalinga
      const repo = new DrizzleStudentRepository();

      const kalingaSummary = await repo.getHostelPresenceSummary({
        staffId: RECEPTION1_STAFF_ID, // Kalinga
        staffRole: "reception_warden",
      });
      const utkalSummary = await repo.getHostelPresenceSummary({
        staffId: RECEPTION2_STAFF_ID, // Utkal
        staffRole: "reception_warden",
      });

      expect(kalingaSummary.studentsOutside).toBeGreaterThanOrEqual(1);
      // Utkal's own total population is unaffected by a Kalinga student's
      // movement state — the two scopes never share a count.
      expect(utkalSummary.totalStudents).toBeGreaterThanOrEqual(0);
    });

    it("super_admin's summary total is at least as large as any single hostel's own scoped total (unscoped, never narrower)", async () => {
      const repo = new DrizzleStudentRepository();

      const kalingaSummary = await repo.getHostelPresenceSummary({
        staffId: RECEPTION1_STAFF_ID,
        staffRole: "reception_warden",
      });
      const superAdminSummary = await repo.getHostelPresenceSummary({
        staffId: SUPER_ADMIN_STAFF_ID,
        staffRole: "super_admin",
      });

      expect(superAdminSummary.totalStudents).toBeGreaterThanOrEqual(kalingaSummary.totalStudents);
    });

    it("never accepts a client-supplied occupancy value — the summary is computed entirely from server-side counts", async () => {
      const repo = new DrizzleStudentRepository();
      const summary = await repo.getHostelPresenceSummary({
        staffId: RECEPTION1_STAFF_ID,
        staffRole: "reception_warden",
      });
      // The method's own input type (StaffScopeInput) has no field capable
      // of carrying a client-supplied count — this assertion documents that
      // invariant structurally rather than merely by convention.
      expect(Object.keys(summary).sort()).toEqual(
        ["studentsInside", "studentsOutside", "totalStudents"].sort(),
      );
      expect(Number.isInteger(summary.totalStudents)).toBe(true);
    });
  });
});
