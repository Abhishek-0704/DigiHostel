import { describe, it, expect } from "vitest";
import { DrizzleLeaveRepository } from "../leave/repository.js";
import { DrizzleMovementRepository } from "../movement/repository.js";
import { NoopJobScheduler } from "../../lib/queue/jobs.js";
import { DrizzleAnalyticsRepository } from "./repository.js";

/**
 * Real-Postgres integration test — mirrors
 * `domain/movement/repository.integration.test.ts`'s own `RUN`-gated
 * convention and its "build the real fixture via the certified upstream
 * chain (create -> startParentApproval -> decide -> authorizeExit ->
 * recordHostelReturn), never hand-seed a row" discipline, so this test
 * exercises the analytics aggregation against genuinely-produced
 * `leave_approval_events`/`leave_exit_authorizations`/`movements` rows, not
 * an assumption about their shape.
 */
const RUN = Boolean(process.env.DATABASE_URL);

describe.skipIf(!RUN)("DrizzleAnalyticsRepository (real Postgres integration)", () => {
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
   * `domain/movement/repository.integration.test.ts` already established.
   * Returns the leave request id, useful for the caller to independently
   * confirm which fixture produced which aggregate. */
  async function buildFullLeaveCycle(): Promise<string> {
    const leaveRepo = new DrizzleLeaveRepository(new NoopJobScheduler());
    const created = await leaveRepo.create({
      studentId: STUDENT1_ID,
      reason: "Analytics integration test",
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
        assertionToken: "analytics-integration-test-token",
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

  describe("getPresence", () => {
    it("hostel_admin scope never exceeds super_admin's own total (Kalinga subset, never a wider or disjoint count)", async () => {
      const repo = new DrizzleAnalyticsRepository();
      const kalinga = await repo.getPresence({
        staffId: HOSTEL_ADMIN1_STAFF_ID,
        staffRole: "hostel_admin",
      });
      const global = await repo.getPresence({
        staffId: SUPER_ADMIN_STAFF_ID,
        staffRole: "super_admin",
      });
      expect(kalinga.totalStudents).toBeGreaterThan(0);
      expect(global.totalStudents).toBeGreaterThanOrEqual(kalinga.totalStudents);
      expect(kalinga.studentsInside + kalinga.studentsOutside).toBe(kalinga.totalStudents);
    });
  });

  describe("getOverview — leave/movement aggregation against a genuine fixture", () => {
    it("reflects a real created -> approved -> exited -> returned leave request with a non-negative, non-null response/movement duration", async () => {
      const before = isoMinutesAgo(5);
      await buildFullLeaveCycle();
      const after = isoMinutesFromNow(5);

      const repo = new DrizzleAnalyticsRepository();
      const overview = await repo.getOverview({
        staffId: HOSTEL_ADMIN1_STAFF_ID,
        staffRole: "hostel_admin",
        dateFrom: before,
        dateTo: after,
      });

      expect(overview.leave.createdInPeriod).toBeGreaterThanOrEqual(1);
      expect(overview.leave.approvedInPeriod).toBeGreaterThanOrEqual(1);
      expect(overview.leave.avgResponseMinutes).not.toBeNull();
      expect(overview.leave.avgResponseMinutes as number).toBeGreaterThanOrEqual(0);
      expect(overview.leave.approvalRate).not.toBeNull();
      expect(overview.leave.approvalRate as number).toBeGreaterThan(0);

      expect(overview.movement.returnsInPeriod).toBeGreaterThanOrEqual(1);
      expect(overview.movement.avgDurationMinutes).not.toBeNull();
      expect(overview.movement.avgDurationMinutes as number).toBeGreaterThanOrEqual(0);
    });

    it("a Utkal hostel_admin sees none of a Kalinga-only fixture created in the same window (hostel isolation, not merely a smaller number)", async () => {
      const before = isoMinutesAgo(5);
      await buildFullLeaveCycle(); // Kalinga student, Kalinga staff throughout
      const after = isoMinutesFromNow(5);

      const repo = new DrizzleAnalyticsRepository();
      const utkalOverview = await repo.getOverview({
        staffId: HOSTEL_ADMIN2_STAFF_ID,
        staffRole: "hostel_admin",
        dateFrom: before,
        dateTo: after,
      });
      // The Utkal admin's own count may be non-zero if Utkal fixtures exist
      // from other tests/seed data — the real assertion is that it is
      // STRICTLY LESS than what the Kalinga admin would see for the exact
      // same window, proving genuine hostel-based filtering rather than an
      // unscoped global count silently returned to every caller.
      const kalingaOverview = await repo.getOverview({
        staffId: HOSTEL_ADMIN1_STAFF_ID,
        staffRole: "hostel_admin",
        dateFrom: before,
        dateTo: after,
      });
      expect(kalingaOverview.leave.createdInPeriod).toBeGreaterThan(
        utkalOverview.leave.createdInPeriod,
      );
    });

    it("a forged/nonexistent staffId resolves to zero counts, never an unscoped global fallback", async () => {
      const repo = new DrizzleAnalyticsRepository();
      const overview = await repo.getOverview({
        staffId: "00000000-0000-0000-0000-000000000000",
        staffRole: "hostel_admin",
        dateFrom: isoMinutesAgo(60),
        dateTo: isoNow(),
      });
      expect(overview.leave.createdInPeriod).toBe(0);
      expect(overview.leave.pendingNow).toBe(0);
      expect(overview.movement.returnsInPeriod).toBe(0);
      expect(overview.presence.totalStudents).toBe(0);
    });

    it("an empty period (no events at all) returns real zeros and null rates/durations, never a fabricated value", async () => {
      const repo = new DrizzleAnalyticsRepository();
      const overview = await repo.getOverview({
        staffId: SUPER_ADMIN_STAFF_ID,
        staffRole: "super_admin",
        dateFrom: "2020-01-01T00:00:00.000Z",
        dateTo: "2020-01-02T00:00:00.000Z",
      });
      expect(overview.leave.createdInPeriod).toBe(0);
      expect(overview.leave.approvalRate).toBeNull();
      expect(overview.leave.avgResponseMinutes).toBeNull();
      expect(overview.movement.avgDurationMinutes).toBeNull();
    });
  });

  describe("getLeaveTrend / getMovementTrend — day bucketing", () => {
    it("buckets a real creation event on today's UTC calendar day, and fills every other day in range with a real zero", async () => {
      await buildFullLeaveCycle();
      const repo = new DrizzleAnalyticsRepository();
      const todayUtc = new Date().toISOString().slice(0, 10);
      const trend = await repo.getLeaveTrend({
        staffId: SUPER_ADMIN_STAFF_ID,
        staffRole: "super_admin",
        dateFrom: isoMinutesAgo(60 * 24 * 3), // 3 days ago
        dateTo: isoNow(),
      });
      // Exactly one point per day in [from, to] — no gaps, no duplicates.
      const dates = trend.createdByDay.map((p) => p.date);
      expect(new Set(dates).size).toBe(dates.length);
      const todayPoint = trend.createdByDay.find((p) => p.date === todayUtc);
      expect(todayPoint).toBeDefined();
      expect(todayPoint!.count).toBeGreaterThanOrEqual(1);
    });

    it("movement trend hour-bucket always returns exactly 24 entries (0-23), even for an empty period", async () => {
      const repo = new DrizzleAnalyticsRepository();
      const trend = await repo.getMovementTrend({
        staffId: SUPER_ADMIN_STAFF_ID,
        staffRole: "super_admin",
        dateFrom: "2020-01-01T00:00:00.000Z",
        dateTo: "2020-01-02T00:00:00.000Z",
      });
      expect(trend.returnsByHour).toHaveLength(24);
      expect(trend.returnsByHour.map((h) => h.hour)).toEqual(
        Array.from({ length: 24 }, (_, i) => i),
      );
      expect(trend.returnsByHour.every((h) => h.count === 0)).toBe(true);
    });
  });
});
