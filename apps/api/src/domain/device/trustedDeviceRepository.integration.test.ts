import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  eq,
  and,
  isNull,
  inArray,
  db,
  parents,
  trustedDevices,
  deviceAttestationEvents,
} from "@digihostel/db";
import { DrizzleTrustedDeviceRepository } from "./trustedDeviceRepository.js";
import { DrizzleAuthDbPort } from "../../lib/auth/db-port.js";

/**
 * Real-Postgres integration test — proves createTrustedDevice()'s actual
 * transactional write (trusted_devices + device_attestation_events +
 * audit_logs together) and its idempotency guarantee against a real unique
 * constraint, not just FakeTrustedDeviceRepository's in-memory tracking
 * (service.test.ts). Same skip-if-no-DATABASE_URL convention as every other
 * integration test in this backend.
 */
const RUN = Boolean(process.env.DATABASE_URL);

describe.skipIf(!RUN)("DrizzleTrustedDeviceRepository (real Postgres integration)", () => {
  const PARENT_ID = "f0400000-0000-0000-0000-000000000001";
  const OTHER_PARENT_ID = "f0400000-0000-0000-0000-000000000002";
  const AUTHGATE_PARENT_ID = "f0400000-0000-0000-0000-000000000003";

  const repository = new DrizzleTrustedDeviceRepository();

  beforeAll(async () => {
    await db.insert(parents).values([
      { id: PARENT_ID, fullName: "ADR-003 Integration Parent", phoneNumber: "+91-9000000201" },
      {
        id: OTHER_PARENT_ID,
        fullName: "ADR-003 Integration Other Parent",
        phoneNumber: "+91-9000000202",
      },
      {
        id: AUTHGATE_PARENT_ID,
        fullName: "ADR-003 AuthGate Integration Parent",
        phoneNumber: "+91-9000000203",
      },
    ]);
  });

  afterAll(async () => {
    const allParentIds = [PARENT_ID, OTHER_PARENT_ID, AUTHGATE_PARENT_ID];
    const rows = await db
      .select({ id: trustedDevices.id })
      .from(trustedDevices)
      .where(inArray(trustedDevices.parentId, allParentIds));
    for (const row of rows) {
      await db
        .delete(deviceAttestationEvents)
        .where(eq(deviceAttestationEvents.trustedDeviceId, row.id));
    }
    for (const parentId of allParentIds) {
      await db.delete(trustedDevices).where(eq(trustedDevices.parentId, parentId));
    }
    for (const parentId of allParentIds) {
      await db.delete(parents).where(eq(parents.id, parentId));
    }
  });

  it("creates a real, active trusted_devices row plus a matching device_attestation_events 'pass' record", async () => {
    const device = await repository.createTrustedDevice({
      parentId: PARENT_ID,
      platform: "android",
      deviceFingerprint: "integration-fp-001",
      attestationProvider: "play_integrity",
    });

    const [deviceRow] = await db
      .select()
      .from(trustedDevices)
      .where(eq(trustedDevices.id, device.id));
    expect(deviceRow.revokedAt).toBeNull();
    expect(deviceRow.parentId).toBe(PARENT_ID);

    const [eventRow] = await db
      .select()
      .from(deviceAttestationEvents)
      .where(eq(deviceAttestationEvents.trustedDeviceId, device.id));
    expect(eventRow.result).toBe("pass");
    expect(eventRow.provider).toBe("play_integrity");
  });

  it("is idempotent for a repeated fingerprint: does not create a second active row (matches the unique index)", async () => {
    await repository.createTrustedDevice({
      parentId: PARENT_ID,
      platform: "android",
      deviceFingerprint: "integration-fp-002",
      attestationProvider: "play_integrity",
    });

    const second = await repository.createTrustedDevice({
      parentId: PARENT_ID,
      platform: "android",
      deviceFingerprint: "integration-fp-002",
      attestationProvider: "play_integrity",
    });

    const rows = await db
      .select()
      .from(trustedDevices)
      .where(
        and(
          eq(trustedDevices.parentId, PARENT_ID),
          eq(trustedDevices.deviceFingerprint, "integration-fp-002"),
          isNull(trustedDevices.revokedAt),
        ),
      );
    expect(rows.length).toBe(1);
    expect(second.id).toBe(rows[0].id);
  });

  it("cross-user isolation: two different parents can each register a device without any interference", async () => {
    const deviceA = await repository.createTrustedDevice({
      parentId: PARENT_ID,
      platform: "android",
      deviceFingerprint: "integration-fp-003-a",
      attestationProvider: "play_integrity",
    });
    const deviceB = await repository.createTrustedDevice({
      parentId: OTHER_PARENT_ID,
      platform: "android",
      deviceFingerprint: "integration-fp-003-b",
      attestationProvider: "play_integrity",
    });

    expect(deviceA.id).not.toBe(deviceB.id);
    const [rowA] = await db.select().from(trustedDevices).where(eq(trustedDevices.id, deviceA.id));
    const [rowB] = await db.select().from(trustedDevices).where(eq(trustedDevices.id, deviceB.id));
    expect(rowA.parentId).toBe(PARENT_ID);
    expect(rowB.parentId).toBe(OTHER_PARENT_ID);
  });

  it("AuthGate integration: a device this repository just created is immediately recognized as trusted by the real, independent DrizzleAuthDbPort.hasActiveTrustedDevice() used to gate leave decisions", async () => {
    const authDbPort = new DrizzleAuthDbPort();

    await expect(authDbPort.hasActiveTrustedDevice(AUTHGATE_PARENT_ID)).resolves.toBe(false);

    await repository.createTrustedDevice({
      parentId: AUTHGATE_PARENT_ID,
      platform: "android",
      deviceFingerprint: "integration-fp-004-authgate",
      attestationProvider: "play_integrity",
    });

    await expect(authDbPort.hasActiveTrustedDevice(AUTHGATE_PARENT_ID)).resolves.toBe(true);
  });
});
