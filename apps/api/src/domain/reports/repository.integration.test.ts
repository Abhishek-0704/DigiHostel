import { describe, it, expect } from "vitest";
import { DrizzleLeaveRepository } from "../leave/repository.js";
import { DrizzleMovementRepository } from "../movement/repository.js";
import { NoopJobScheduler } from "../../lib/queue/jobs.js";
import { DrizzleReportsRepository } from "./repository.js";

/**
 * Real-Postgres integration test — mirrors
 * `domain/analytics/repository.integration.test.ts`'s own `RUN`-gated
 * convention and its "build the real fixture via the certified upstream
 * chain, never hand-seed a row" discipline.
 */
const RUN = Boolean(process.env.DATABASE_URL);

describe.skipIf(!RUN)("DrizzleReportsRepository (real Postgres integration)", () => {
  const STUDENT1_ID = "c0000000-0000-0000-0000-000000000001"; // seeded student1, Kalinga
  const PARENT1_ID = "d0000000-0000-0000-0000-000000000001"; // seeded parent1-father, linked to student1
  const RECEPTION1_STAFF_ID = "e0000000-0000-0000-0000-000000000001"; // seeded, Kalinga
  const HOSTEL_ADMIN1_STAFF_ID = "e0000000-0000-0000-0000-000000000003"; // seeded hostel_admin, Kalinga
  const HOSTEL_ADMIN2_STAFF_ID = "e0000000-0000-0000-0000-000000000005"; // seeded hostel_admin, Utkal
  const SUPER_ADMIN_STAFF_ID = "e0000000-0000-0000-0000-000000000004";

  function isoNow(): string {
    return new Date().toISOString();
  }
  function isoMinutesAgo(minutes: number): string {
    return new Date(Date.now() - minutes * 60_000).toISOString();
  }
  function isoMinutesFromNow(minutes: number): string {
    return new Date(Date.now() + minutes * 60_000).toISOString();
  }

  /** Real, full leave lifecycle (create -> send for parent approval ->
   * parent approves -> exit authorized -> hostel return recorded), built
   * via the certified upstream repositories — the exact same discipline
   * `domain/analytics/repository.integration.test.ts` already established.
   * Returns the leave request id. */
  async function buildFullLeaveCycle(): Promise<string> {
    const leaveRepo = new DrizzleLeaveRepository(new NoopJobScheduler());
    const created = await leaveRepo.create({
      studentId: STUDENT1_ID,
      reason: "Reports integration test",
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
        assertionToken: "reports-integration-test-token",
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
    const movementRepo = new DrizzleMovementRepository();
    const returned = await movementRepo.recordHostelReturn({
      leaveRequestId: created.id,
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
    });
    if (returned.kind !== "success") throw new Error("recordHostelReturn failed");
    return created.id;
  }

  describe("listLeaveAuthorization", () => {
    it("reflects a real created leave request within its hostel scope, filterable by status", async () => {
      const before = isoMinutesAgo(5);
      const leaveRequestId = await buildFullLeaveCycle();
      const after = isoMinutesFromNow(5);

      const repo = new DrizzleReportsRepository();
      const result = await repo.listLeaveAuthorization(
        { staffId: HOSTEL_ADMIN1_STAFF_ID, staffRole: "hostel_admin" },
        { dateFrom: before, dateTo: after },
        1,
        50,
      );
      expect(result.total).toBeGreaterThanOrEqual(1);
      const row = result.rows.find((r) => (r as { studentRollNumber?: string }).studentRollNumber);
      expect(row).toBeDefined();

      const approvedOnly = await repo.listLeaveAuthorization(
        { staffId: HOSTEL_ADMIN1_STAFF_ID, staffRole: "hostel_admin" },
        { dateFrom: before, dateTo: after, statuses: ["approved"] },
        1,
        50,
      );
      expect(approvedOnly.total).toBeGreaterThanOrEqual(1);
      expect(approvedOnly.rows.every((r) => (r as { status: string }).status === "approved")).toBe(
        true,
      );
      void leaveRequestId;
    });

    it("a Utkal hostel_admin sees strictly fewer rows than the Kalinga admin for the same Kalinga-only fixture window", async () => {
      const before = isoMinutesAgo(5);
      await buildFullLeaveCycle();
      const after = isoMinutesFromNow(5);

      const repo = new DrizzleReportsRepository();
      const utkal = await repo.listLeaveAuthorization(
        { staffId: HOSTEL_ADMIN2_STAFF_ID, staffRole: "hostel_admin" },
        { dateFrom: before, dateTo: after },
        1,
        50,
      );
      const kalinga = await repo.listLeaveAuthorization(
        { staffId: HOSTEL_ADMIN1_STAFF_ID, staffRole: "hostel_admin" },
        { dateFrom: before, dateTo: after },
        1,
        50,
      );
      expect(kalinga.total).toBeGreaterThan(utkal.total);
    });

    it("a forged/nonexistent staffId resolves to zero rows, never an unscoped global fallback", async () => {
      const repo = new DrizzleReportsRepository();
      const result = await repo.listLeaveAuthorization(
        { staffId: "00000000-0000-0000-0000-000000000000", staffRole: "hostel_admin" },
        { dateFrom: isoMinutesAgo(60), dateTo: isoNow() },
        1,
        50,
      );
      expect(result.total).toBe(0);
      expect(result.rows).toEqual([]);
    });
  });

  describe("listStudentMovement", () => {
    it("reflects a real recorded hostel return, with a real recordedByStaffName", async () => {
      const before = isoMinutesAgo(5);
      await buildFullLeaveCycle();
      const after = isoMinutesFromNow(5);

      const repo = new DrizzleReportsRepository();
      const result = await repo.listStudentMovement(
        { staffId: HOSTEL_ADMIN1_STAFF_ID, staffRole: "hostel_admin" },
        { dateFrom: before, dateTo: after },
        1,
        50,
      );
      expect(result.total).toBeGreaterThanOrEqual(1);
      const row = result.rows[0] as { movementType: string; recordedByStaffName: string | null };
      expect(row.movementType).toBe("hostel_return");
      expect(row.recordedByStaffName).toBeTruthy();
    });
  });

  describe("listParentApproval", () => {
    it("reflects the real manual_override and responded events from a full leave cycle, never the actor identity", async () => {
      const before = isoMinutesAgo(5);
      await buildFullLeaveCycle();
      const after = isoMinutesFromNow(5);

      const repo = new DrizzleReportsRepository();
      const result = await repo.listParentApproval(
        { staffId: SUPER_ADMIN_STAFF_ID, staffRole: "super_admin" },
        { dateFrom: before, dateTo: after },
        1,
        50,
      );
      expect(result.total).toBeGreaterThanOrEqual(2); // manual_override + responded
      const eventTypes = result.rows.map((r) => (r as { eventType: string }).eventType);
      expect(eventTypes).toContain("manual_override");
      expect(eventTypes).toContain("responded");
      for (const row of result.rows) {
        expect(row).not.toHaveProperty("actorStaffId");
        expect(row).not.toHaveProperty("actorParentId");
      }
    });

    it("filters by eventTypes", async () => {
      const before = isoMinutesAgo(5);
      await buildFullLeaveCycle();
      const after = isoMinutesFromNow(5);

      const repo = new DrizzleReportsRepository();
      const result = await repo.listParentApproval(
        { staffId: SUPER_ADMIN_STAFF_ID, staffRole: "super_admin" },
        { dateFrom: before, dateTo: after, eventTypes: ["responded"] },
        1,
        50,
      );
      expect(result.rows.every((r) => (r as { eventType: string }).eventType === "responded")).toBe(
        true,
      );
    });
  });

  describe("listNotificationActivity", () => {
    it("an empty period returns a real zero, never a fabricated value", async () => {
      const repo = new DrizzleReportsRepository();
      const result = await repo.listNotificationActivity(
        { staffId: SUPER_ADMIN_STAFF_ID, staffRole: "super_admin" },
        { dateFrom: "2020-01-01T00:00:00.000Z", dateTo: "2020-01-02T00:00:00.000Z" },
        1,
        50,
      );
      expect(result.total).toBe(0);
      expect(result.rows).toEqual([]);
    });
  });

  describe("templates", () => {
    it("creates, lists, updates, and deletes a template — personal to the owning staff member", async () => {
      const repo = new DrizzleReportsRepository();
      const scope = { staffId: HOSTEL_ADMIN1_STAFF_ID, staffRole: "hostel_admin" as const };

      const created = await repo.createTemplate({
        ...scope,
        reportId: "leave_authorization",
        name: `Integration test template ${Date.now()}`,
        filters: { statuses: ["approved"] },
        selectedFields: ["studentRollNumber"],
        isFavorite: false,
      });
      expect(created.kind).toBe("success");
      if (created.kind !== "success") return;

      const list = await repo.listTemplates(scope);
      expect(list.some((t) => t.id === created.template.id)).toBe(true);

      const otherStaffList = await repo.listTemplates({
        staffId: HOSTEL_ADMIN2_STAFF_ID,
        staffRole: "hostel_admin",
      });
      expect(otherStaffList.some((t) => t.id === created.template.id)).toBe(false);

      const updated = await repo.updateTemplate({
        ...scope,
        templateId: created.template.id,
        isFavorite: true,
      });
      expect(updated.kind).toBe("success");
      if (updated.kind === "success") expect(updated.template.isFavorite).toBe(true);

      const deleted = await repo.deleteTemplate(scope, created.template.id);
      expect(deleted.kind).toBe("success");

      const afterDelete = await repo.listTemplates(scope);
      expect(afterDelete.some((t) => t.id === created.template.id)).toBe(false);
    });

    it("a duplicate name for the same staff member is rejected", async () => {
      const repo = new DrizzleReportsRepository();
      const scope = { staffId: HOSTEL_ADMIN1_STAFF_ID, staffRole: "hostel_admin" as const };
      const name = `Duplicate test ${Date.now()}`;
      const first = await repo.createTemplate({
        ...scope,
        reportId: "leave_authorization",
        name,
        filters: {},
        selectedFields: [],
        isFavorite: false,
      });
      expect(first.kind).toBe("success");
      const second = await repo.createTemplate({
        ...scope,
        reportId: "leave_authorization",
        name,
        filters: {},
        selectedFields: [],
        isFavorite: false,
      });
      expect(second.kind).toBe("duplicate_name");
      if (first.kind === "success") await repo.deleteTemplate(scope, first.template.id);
    });
  });

  describe("history", () => {
    it("recordExecution + listHistory reflects a real execution, scoped to the requesting staff member", async () => {
      const repo = new DrizzleReportsRepository();
      await repo.recordExecution({
        reportId: "leave_authorization",
        requestedByStaffId: HOSTEL_ADMIN1_STAFF_ID,
        hostelScopeId: null,
        filtersSummary: { statuses: ["approved"] },
        rowCount: 3,
      });
      const history = await repo.listHistory(
        { staffId: HOSTEL_ADMIN1_STAFF_ID, staffRole: "hostel_admin" },
        10,
      );
      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history[0]!.reportId).toBe("leave_authorization");
      expect(history[0]!.rowCount).toBeGreaterThanOrEqual(0);
    });
  });
});
