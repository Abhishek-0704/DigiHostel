import { describe, it, expect, beforeEach } from "vitest";
import { eq, and, db, staffPreferences, auditLogs } from "@digihostel/db";
import { DrizzleProfileRepository } from "./repository.js";

/**
 * Real-Postgres integration test for the Administrative Profile & Personal
 * Preferences Center (Phase 7, Prompt 17) — exercises the actual
 * upsert-on-first-access shape, the real transactional audit write, and the
 * real `staff.full_name` self-update alongside a real `staff_preferences`
 * update in the same transaction. Mirrors `domain/configuration/repository.
 * integration.test.ts`'s own `RUN`-gated convention.
 *
 * RLS's own adversarial cross-staff/anon/super_admin denial matrix is
 * proven separately and exhaustively by
 * supabase/tests/database/29_prompt17_staff_preferences_rls.sql (12/12) —
 * not duplicated here, since this repository always runs through Fastify's
 * service-role connection (bypasses RLS by design, same as every other
 * repository in this codebase) and this file's job is to prove the
 * repository's OWN logic (default-row creation, transactional audit,
 * combined staff+preferences update), not re-prove the database-layer
 * boundary pgTAP already covers.
 */
const RUN = Boolean(process.env.DATABASE_URL);

describe.skipIf(!RUN)("DrizzleProfileRepository (real Postgres integration)", () => {
  const RECEPTION1_STAFF_ID = "e0000000-0000-0000-0000-000000000001"; // seeded reception_warden
  const RECEPTION2_STAFF_ID = "e0000000-0000-0000-0000-000000000006"; // seeded reception_warden, Utkal

  let repo: DrizzleProfileRepository;

  beforeEach(async () => {
    repo = new DrizzleProfileRepository();
    await db.delete(staffPreferences);
    await db.delete(auditLogs).where(eq(auditLogs.action, "profile.updated"));
  });

  it("getOrCreate(): creates a real default row on first access, and is idempotent on a second call", async () => {
    const first = await repo.getOrCreate(RECEPTION1_STAFF_ID);
    expect(first.preferences.theme).toBe("system");
    expect(first.preferences.phoneNumber).toBeNull();

    const rows = await db
      .select()
      .from(staffPreferences)
      .where(eq(staffPreferences.staffId, RECEPTION1_STAFF_ID));
    expect(rows).toHaveLength(1);

    const second = await repo.getOrCreate(RECEPTION1_STAFF_ID);
    expect(second.preferences.theme).toBe("system");
    const rowsAfter = await db
      .select()
      .from(staffPreferences)
      .where(eq(staffPreferences.staffId, RECEPTION1_STAFF_ID));
    expect(rowsAfter).toHaveLength(1); // still exactly one row, not duplicated
  });

  it("getOrCreate(): never creates or returns a row for any staff id other than the one requested", async () => {
    await repo.getOrCreate(RECEPTION1_STAFF_ID);
    const otherRows = await db
      .select()
      .from(staffPreferences)
      .where(eq(staffPreferences.staffId, RECEPTION2_STAFF_ID));
    expect(otherRows).toHaveLength(0);
  });

  it("update(): writes real staff.full_name AND staff_preferences changes in one transaction, plus one real audit row", async () => {
    await repo.getOrCreate(RECEPTION1_STAFF_ID);
    const result = await repo.update(RECEPTION1_STAFF_ID, {
      fullName: "Integration Test Name",
      bio: "Updated via integration test.",
      theme: "dark",
    });
    expect(result.identity.fullName).toBe("Integration Test Name");
    expect(result.preferences.bio).toBe("Updated via integration test.");
    expect(result.preferences.theme).toBe("dark");

    const auditRows = await db
      .select()
      .from(auditLogs)
      .where(
        and(eq(auditLogs.action, "profile.updated"), eq(auditLogs.entityId, RECEPTION1_STAFF_ID)),
      );
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]!.actorType).toBe("staff");
    expect(auditRows[0]!.actorId).toBe(RECEPTION1_STAFF_ID);
    const metadata = auditRows[0]!.metadata as { changedFields: string[] };
    expect(metadata.changedFields).toContain("fullName");
    expect(metadata.changedFields).toContain("bio");
    expect(metadata.changedFields).toContain("theme");
  });

  it("update(): never writes to another staff member's staff_preferences row", async () => {
    await repo.getOrCreate(RECEPTION1_STAFF_ID);
    await repo.getOrCreate(RECEPTION2_STAFF_ID);
    await repo.update(RECEPTION1_STAFF_ID, { bio: "reception1 only" });

    const [reception2Row] = await db
      .select()
      .from(staffPreferences)
      .where(eq(staffPreferences.staffId, RECEPTION2_STAFF_ID));
    expect(reception2Row!.bio).toBeNull();
  });

  it("update(): a partial update to one preference field leaves every other field untouched", async () => {
    await repo.update(RECEPTION1_STAFF_ID, { theme: "dark", highContrast: true });
    const result = await repo.update(RECEPTION1_STAFF_ID, { bio: "second update" });
    expect(result.preferences.theme).toBe("dark");
    expect(result.preferences.highContrast).toBe(true);
    expect(result.preferences.bio).toBe("second update");
  });
});
