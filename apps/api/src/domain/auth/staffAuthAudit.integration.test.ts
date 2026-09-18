import { describe, it, expect, afterAll } from "vitest";
import { eq, and, db, auditLogs } from "@digihostel/db";
import { recordStaffAuthEvent } from "./staffAuthAudit.js";

/**
 * Real-Postgres integration test — proves the actual `db.insert(auditLogs)`
 * call succeeds against the real schema (actorType enum, jsonb metadata
 * default, etc.), not just that the route contract returns 204 (auth.test.ts's
 * own unit-level coverage, which has no real database wired in). Same
 * convention as domain/device/challengeRepository.integration.test.ts:
 * skipped automatically when DATABASE_URL isn't set.
 *
 * `audit_logs.actor_id` is a plain uuid column with no foreign key
 * (packages/db/src/schema/audit.ts) — a fixed synthetic UUID is used
 * directly, no real `staff` row is required for this test to be meaningful.
 */
const RUN = Boolean(process.env.DATABASE_URL);

describe.skipIf(!RUN)("recordStaffAuthEvent (real Postgres integration)", () => {
  const STAFF_ID = "f0500000-0000-0000-0000-000000000001";

  afterAll(async () => {
    await db.delete(auditLogs).where(eq(auditLogs.actorId, STAFF_ID));
  });

  it("writes a real audit_logs row with the expected shape", async () => {
    await recordStaffAuthEvent(STAFF_ID, "sign_in_success");

    const rows = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.actorId, STAFF_ID), eq(auditLogs.action, "staff_sign_in_success")));

    expect(rows).toHaveLength(1);
    expect(rows[0].actorType).toBe("staff");
    expect(rows[0].entityType).toBe("staff");
    expect(rows[0].entityId).toBe(STAFF_ID);
  });

  it("every declared event maps to a distinct action string", async () => {
    for (const event of ["mfa_success", "mfa_failure", "sign_out"] as const) {
      await recordStaffAuthEvent(STAFF_ID, event);
    }

    const rows = await db.select().from(auditLogs).where(eq(auditLogs.actorId, STAFF_ID));
    const actions = rows.map((r) => r.action).sort();
    expect(actions).toEqual(
      ["staff_mfa_failure", "staff_mfa_success", "staff_sign_in_success", "staff_sign_out"].sort(),
    );
  });
});
