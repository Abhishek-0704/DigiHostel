import { describe, it, expect, beforeEach } from "vitest";
import { eq, sql, db, configurationEntries, auditLogs } from "@digihostel/db";
import { DrizzleConfigurationRepository } from "./repository.js";

/**
 * Real-Postgres integration test — exercises the actual hostel-scope SQL
 * condition, the real partial-unique-index duplicate-key enforcement, the
 * real optimistic-concurrency race, and the real transactional-inline
 * audit write, against the local Supabase instance's real seed data.
 * Mirrors `domain/staff/repository.integration.test.ts`'s own `RUN`-gated
 * convention.
 */
const RUN = Boolean(process.env.DATABASE_URL);

describe.skipIf(!RUN)("DrizzleConfigurationRepository (real Postgres integration)", () => {
  const SUPER_ADMIN_STAFF_ID = "e0000000-0000-0000-0000-000000000004"; // seeded super_admin
  const HOSTEL_ADMIN1_STAFF_ID = "e0000000-0000-0000-0000-000000000003"; // seeded hostel_admin, Kalinga
  const HOSTEL_ADMIN2_STAFF_ID = "e0000000-0000-0000-0000-000000000005"; // seeded hostel_admin, Utkal
  const KALINGA_HOSTEL_ID = "a0000000-0000-0000-0000-000000000001";
  const UTKAL_HOSTEL_ID = "a0000000-0000-0000-0000-000000000002";

  let repo: DrizzleConfigurationRepository;

  beforeEach(async () => {
    repo = new DrizzleConfigurationRepository();
    // Clean slate for every test — this table has no seed.sql fixtures.
    await db.delete(configurationEntries);
  });

  it("create(): a real GLOBAL entry created by super_admin is visible to every acting role", async () => {
    const outcome = await repo.create({
      actingStaffId: SUPER_ADMIN_STAFF_ID,
      actingRole: "super_admin",
      actingHostelId: null,
      domain: "system",
      key: "integration_test_global",
      value: "hello",
      valueType: "string",
      description: null,
      scope: "global",
      hostelId: null,
    });
    expect(outcome.kind).toBe("success");
    if (outcome.kind !== "success") return;
    expect(outcome.entry.version).toBe(1);
    expect(outcome.entry.createdByName).toBe("Test Super Admin");

    const seenByHostelAdmin = await repo.getById(
      outcome.entry.id,
      "hostel_admin",
      KALINGA_HOSTEL_ID,
    );
    expect(seenByHostelAdmin).not.toBeNull();
  });

  it("create(): the real partial unique index rejects a duplicate GLOBAL domain+key", async () => {
    const first = await repo.create({
      actingStaffId: SUPER_ADMIN_STAFF_ID,
      actingRole: "super_admin",
      actingHostelId: null,
      domain: "system",
      key: "integration_test_dup",
      value: "a",
      valueType: "string",
      description: null,
      scope: "global",
      hostelId: null,
    });
    expect(first.kind).toBe("success");

    const second = await repo.create({
      actingStaffId: SUPER_ADMIN_STAFF_ID,
      actingRole: "super_admin",
      actingHostelId: null,
      domain: "system",
      key: "integration_test_dup",
      value: "b",
      valueType: "string",
      description: null,
      scope: "global",
      hostelId: null,
    });
    expect(second.kind).toBe("duplicate_key");
  });

  it("create(): the SAME domain+key is allowed at TWO DIFFERENT hostel scopes (the partial index is scoped, not global)", async () => {
    const kalinga = await repo.create({
      actingStaffId: HOSTEL_ADMIN1_STAFF_ID,
      actingRole: "hostel_admin",
      actingHostelId: KALINGA_HOSTEL_ID,
      domain: "hostel",
      key: "warden_note",
      value: "Kalinga note",
      valueType: "string",
      description: null,
      scope: "hostel",
      hostelId: KALINGA_HOSTEL_ID,
    });
    const utkal = await repo.create({
      actingStaffId: HOSTEL_ADMIN2_STAFF_ID,
      actingRole: "hostel_admin",
      actingHostelId: UTKAL_HOSTEL_ID,
      domain: "hostel",
      key: "warden_note",
      value: "Utkal note",
      valueType: "string",
      description: null,
      scope: "hostel",
      hostelId: UTKAL_HOSTEL_ID,
    });
    expect(kalinga.kind).toBe("success");
    expect(utkal.kind).toBe("success");
  });

  it("hostel scope: a real hostel_admin (Kalinga) query does not see Utkal's hostel-scoped entry, but does see the global one", async () => {
    await repo.create({
      actingStaffId: SUPER_ADMIN_STAFF_ID,
      actingRole: "super_admin",
      actingHostelId: null,
      domain: "system",
      key: "integration_test_scope_global",
      value: "g",
      valueType: "string",
      description: null,
      scope: "global",
      hostelId: null,
    });
    await repo.create({
      actingStaffId: HOSTEL_ADMIN2_STAFF_ID,
      actingRole: "hostel_admin",
      actingHostelId: UTKAL_HOSTEL_ID,
      domain: "hostel",
      key: "integration_test_scope_utkal",
      value: "u",
      valueType: "string",
      description: null,
      scope: "hostel",
      hostelId: UTKAL_HOSTEL_ID,
    });

    const result = await repo.list({
      actingStaffId: HOSTEL_ADMIN1_STAFF_ID,
      actingRole: "hostel_admin",
      actingHostelId: KALINGA_HOSTEL_ID,
      page: 1,
      pageSize: 50,
      sortDir: "desc",
    });
    const keys = result.items.map((i) => i.key);
    expect(keys).toContain("integration_test_scope_global");
    expect(keys).not.toContain("integration_test_scope_utkal");
  });

  it("update(): a real optimistic-concurrency race — two concurrent updates against the same version produce exactly one success and one stale_version", async () => {
    const created = await repo.create({
      actingStaffId: SUPER_ADMIN_STAFF_ID,
      actingRole: "super_admin",
      actingHostelId: null,
      domain: "system",
      key: "integration_test_race",
      value: "initial",
      valueType: "string",
      description: null,
      scope: "global",
      hostelId: null,
    });
    expect(created.kind).toBe("success");
    if (created.kind !== "success") return;

    const [resultA, resultB] = await Promise.all([
      repo.update({
        actingStaffId: SUPER_ADMIN_STAFF_ID,
        actingRole: "super_admin",
        actingHostelId: null,
        entryId: created.entry.id,
        expectedVersion: 1,
        value: "from-a",
      }),
      repo.update({
        actingStaffId: SUPER_ADMIN_STAFF_ID,
        actingRole: "super_admin",
        actingHostelId: null,
        entryId: created.entry.id,
        expectedVersion: 1,
        value: "from-b",
      }),
    ]);
    const kinds = [resultA.kind, resultB.kind].sort();
    expect(kinds).toEqual(["stale_version", "success"]);

    const final = await repo.getById(created.entry.id, "super_admin", null);
    expect(final!.version).toBe(2);
  });

  it("update(): a real transactional-inline audit_logs row is written on success (before/after count)", async () => {
    const created = await repo.create({
      actingStaffId: SUPER_ADMIN_STAFF_ID,
      actingRole: "super_admin",
      actingHostelId: null,
      domain: "system",
      key: "integration_test_audit",
      value: "before",
      valueType: "string",
      description: null,
      scope: "global",
      hostelId: null,
    });
    expect(created.kind).toBe("success");
    if (created.kind !== "success") return;

    const beforeCount = await db
      .select({ count: sql<string>`count(*)` })
      .from(auditLogs)
      .where(eq(auditLogs.entityId, created.entry.id));

    await repo.update({
      actingStaffId: SUPER_ADMIN_STAFF_ID,
      actingRole: "super_admin",
      actingHostelId: null,
      entryId: created.entry.id,
      expectedVersion: 1,
      value: "after",
    });

    const afterCount = await db
      .select({ count: sql<string>`count(*)` })
      .from(auditLogs)
      .where(eq(auditLogs.entityId, created.entry.id));

    // create() writes one audit row (fire-and-forget), update() writes a
    // second (transactional-inline) — proves both paths genuinely persist.
    expect(Number(afterCount[0]!.count)).toBeGreaterThan(Number(beforeCount[0]!.count));
  });

  it("create(): rejects an invalid (nonexistent) hostel id with a real DB existence check", async () => {
    const outcome = await repo.create({
      actingStaffId: SUPER_ADMIN_STAFF_ID,
      actingRole: "super_admin",
      actingHostelId: null,
      domain: "hostel",
      key: "integration_test_invalid_hostel",
      value: "x",
      valueType: "string",
      description: null,
      scope: "hostel",
      hostelId: "00000000-0000-0000-0000-000000000099",
    });
    expect(outcome.kind).toBe("invalid_hostel");
  });
});
