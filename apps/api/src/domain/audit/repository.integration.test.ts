import { describe, it, expect } from "vitest";
import { DrizzleAuditRepository } from "./repository.js";
import { DrizzleEmergencyRepository } from "../emergency/repository.js";
import { DrizzleHealthRepository } from "../health/repository.js";

/**
 * Real-Postgres integration test — the audit read path's own hostel-scope
 * resolution is entirely raw SQL (repository.ts's RESOLVED_CTE), which no
 * fake repository can meaningfully exercise. This test drives real,
 * already-certified write paths (DrizzleEmergencyRepository.create(),
 * DrizzleHealthRepository.create()) to produce genuine `audit_logs` rows,
 * then proves DrizzleAuditRepository.list()/getStatistics() correctly
 * resolve and enforce hostel scope over them — never a fabricated fixture
 * row inserted directly into audit_logs. Mirrors
 * domain/emergency/repository.integration.test.ts's own `RUN`-gated
 * convention and real seeded staff/student ids.
 */
const RUN = Boolean(process.env.DATABASE_URL);

describe.skipIf(!RUN)("DrizzleAuditRepository (real Postgres integration)", () => {
  const RECEPTION1_STAFF_ID = "e0000000-0000-0000-0000-000000000001"; // Kalinga
  const RECEPTION2_STAFF_ID = "e0000000-0000-0000-0000-000000000006"; // Utkal
  const SUPER_ADMIN_STAFF_ID = "e0000000-0000-0000-0000-000000000004";
  const HOSTELADMIN1_STAFF_ID = "e0000000-0000-0000-0000-000000000003"; // Kalinga, staff.id (not auth_user_id)

  it("a genuine emergency report by reception1 (Kalinga) produces an audit_logs row visible to reception1 via GET /audit, and to super_admin, but NEVER to reception2 (Utkal)", async () => {
    const emergencyRepo = new DrizzleEmergencyRepository();
    const created = await emergencyRepo.create({
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      rollNumber: "TEST-S001",
      category: "medical",
      severity: "high",
      description: "Audit integration test: cross-hostel visibility",
    });
    expect(created.kind).toBe("success");
    if (created.kind !== "success") return;
    const incidentId = created.incident.id;

    const auditRepo = new DrizzleAuditRepository();

    // Same-hostel (reception1, Kalinga): the real event must appear.
    const own = await auditRepo.list({
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      entityTypes: ["security_incidents"],
      page: 1,
      pageSize: 50,
      sortDir: "desc",
    });
    const ownMatch = own.items.find((i) => i.entityId === incidentId);
    expect(ownMatch).toBeDefined();
    expect(ownMatch?.action).toBe("emergency.incident_reported");
    expect(ownMatch?.module).toBe("emergency");
    expect(ownMatch?.hostelId).toBe("a0000000-0000-0000-0000-000000000001");
    expect(ownMatch?.studentRollNumber).toBe("TEST-S001");

    // Cross-hostel (reception2, Utkal): the SAME real row must be entirely
    // absent — not merely unlinked or masked, genuinely filtered out.
    const cross = await auditRepo.list({
      staffId: RECEPTION2_STAFF_ID,
      staffRole: "reception_warden",
      entityTypes: ["security_incidents"],
      page: 1,
      pageSize: 50,
      sortDir: "desc",
    });
    expect(cross.items.find((i) => i.entityId === incidentId)).toBeUndefined();

    // super_admin: unscoped, must see it too.
    const superAdmin = await auditRepo.list({
      staffId: SUPER_ADMIN_STAFF_ID,
      staffRole: "super_admin",
      entityTypes: ["security_incidents"],
      page: 1,
      pageSize: 50,
      sortDir: "desc",
    });
    expect(superAdmin.items.find((i) => i.entityId === incidentId)).toBeDefined();

    // A second, independently-scoped hostel_admin from the SAME hostel
    // (Kalinga) must also see it — proving scope is genuinely hostel-based,
    // not merely staffId-based.
    const sameHostelDifferentStaff = await auditRepo.list({
      staffId: HOSTELADMIN1_STAFF_ID,
      staffRole: "hostel_admin",
      entityTypes: ["security_incidents"],
      page: 1,
      pageSize: 50,
      sortDir: "desc",
    });
    expect(sameHostelDifferentStaff.items.find((i) => i.entityId === incidentId)).toBeDefined();
  });

  it("a genuine health case report by reception1 (Kalinga) resolves module='health' and the correct student/hostel fields", async () => {
    const healthRepo = new DrizzleHealthRepository();
    const created = await healthRepo.create({
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      rollNumber: "TEST-S001",
      category: "outpatient_visit",
      severity: "low",
      description: "Audit integration test: health module resolution",
    });
    expect(created.kind).toBe("success");
    if (created.kind !== "success") return;
    expect(created.healthCase.status).toBe("new");

    const auditRepo = new DrizzleAuditRepository();
    const result = await auditRepo.list({
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      entityTypes: ["health_cases"],
      page: 1,
      pageSize: 50,
      sortDir: "desc",
    });
    const match = result.items.find((i) => i.entityId === created.healthCase.id);
    expect(match).toBeDefined();
    expect(match?.module).toBe("health");
    expect(match?.action).toBe("health.case_reported");
    expect(match?.studentFullName).toBe("Test Student One");
  });

  it("search (q) matches the real student full_name, scoped to the caller's own hostel", async () => {
    const emergencyRepo = new DrizzleEmergencyRepository();
    const created = await emergencyRepo.create({
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      rollNumber: "TEST-S001",
      category: "other",
      severity: "informational",
      description: "Audit integration test: search",
    });
    expect(created.kind).toBe("success");
    if (created.kind !== "success") return;

    const auditRepo = new DrizzleAuditRepository();
    const found = await auditRepo.list({
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      q: "Test Student",
      entityTypes: ["security_incidents"],
      page: 1,
      pageSize: 50,
      sortDir: "desc",
    });
    expect(found.items.find((i) => i.entityId === created.incident.id)).toBeDefined();

    // reception2 (Utkal) searching for the SAME name finds nothing — the
    // hostel-scope filter applies before the search filter, not after.
    const notFound = await auditRepo.list({
      staffId: RECEPTION2_STAFF_ID,
      staffRole: "reception_warden",
      q: "Test Student",
      entityTypes: ["security_incidents"],
      page: 1,
      pageSize: 50,
      sortDir: "desc",
    });
    expect(notFound.items.find((i) => i.entityId === created.incident.id)).toBeUndefined();
  });

  it("getStatistics: super_admin's eventsToday is at least as large as reception1's own hostel-scoped eventsToday", async () => {
    const emergencyRepo = new DrizzleEmergencyRepository();
    await emergencyRepo.create({
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
      rollNumber: "TEST-S001",
      category: "other",
      severity: "informational",
      description: "Audit integration test: statistics",
    });

    const auditRepo = new DrizzleAuditRepository();
    const scoped = await auditRepo.getStatistics({
      staffId: RECEPTION1_STAFF_ID,
      staffRole: "reception_warden",
    });
    const unscoped = await auditRepo.getStatistics({
      staffId: SUPER_ADMIN_STAFF_ID,
      staffRole: "super_admin",
    });
    expect(unscoped.eventsToday).toBeGreaterThanOrEqual(scoped.eventsToday);
    expect(scoped.byModule.emergency).toBeGreaterThan(0);
  });

  it("pagination: a deterministic secondary sort key (id) prevents duplicate/missing rows when many events share the same second", async () => {
    const auditRepo = new DrizzleAuditRepository();
    const page1 = await auditRepo.list({
      staffId: SUPER_ADMIN_STAFF_ID,
      staffRole: "super_admin",
      page: 1,
      pageSize: 5,
      sortDir: "desc",
    });
    const page2 = await auditRepo.list({
      staffId: SUPER_ADMIN_STAFF_ID,
      staffRole: "super_admin",
      page: 2,
      pageSize: 5,
      sortDir: "desc",
    });
    const page1Ids = new Set(page1.items.map((i) => i.id));
    const overlap = page2.items.filter((i) => page1Ids.has(i.id));
    expect(overlap).toHaveLength(0);
  });
});
