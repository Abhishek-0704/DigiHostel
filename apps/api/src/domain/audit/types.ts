/**
 * Enterprise Audit Center (Phase 5, Prompt 12) domain types.
 *
 * Reconnaissance before this file was written confirmed `audit_logs`
 * (packages/db/src/schema/audit.ts) already exists as the authoritative,
 * cross-module compliance trail — every module (leave, movement, emergency,
 * health, device, staff auth) already writes to it at the Fastify service
 * layer, and it has ZERO client-facing RLS by design (only Fastify's
 * service-role connection may read/write it). What was genuinely missing
 * was a privileged, staff-authorized READ endpoint — this domain adds
 * exactly that, no new write path, no new table, no schema/RLS change.
 *
 * `audit_logs` itself carries no `hostel_id` column (it is a flat,
 * polymorphic `entity_type`/`entity_id` trail) — hostel scope is derived
 * per-row by joining `entity_id` back to the owning domain table
 * (`leave_requests`/`security_incidents`/`health_cases` -> `students`, or
 * `staff` directly), exactly mirroring the `scopeCheck`/`hostelScopedForStaff`
 * pattern already established in domain/emergency, domain/health, and
 * domain/leave. Rows whose `entity_type` has no hostel-resolvable join
 * (`trusted_devices`, `device_registration_challenges` — parent-security
 * events with no hostel concept at all) are visible ONLY to `super_admin`,
 * never to a hostel-scoped role — a deliberate data-minimization choice
 * (§38), not an oversight.
 */

export const AUDIT_MODULES = [
  "leave",
  "movement",
  "emergency",
  "health",
  "device",
  "staff-auth",
  "other",
] as const;
export type AuditModule = (typeof AUDIT_MODULES)[number];

export const AUDIT_ACTOR_TYPES = ["student", "parent", "staff", "system"] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

/** Every distinct `entity_type` value currently written by any module,
 * confirmed by repository-wide search — never invented. */
export const AUDIT_ENTITY_TYPES = [
  "leave_requests",
  "security_incidents",
  "health_cases",
  "staff",
  "trusted_devices",
  "device_registration_challenges",
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export interface StaffScopeInput {
  staffId: string;
  staffRole: "reception_warden" | "hostel_admin" | "super_admin";
}

export interface AuditListItemView {
  id: string;
  occurredAt: string;
  action: string;
  module: AuditModule;
  actorType: AuditActorType;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  entityType: string;
  entityId: string;
  studentId: string | null;
  studentFullName: string | null;
  studentRollNumber: string | null;
  hostelId: string | null;
  hostelName: string | null;
  metadata: Record<string, unknown>;
}

export interface AuditListInput extends StaffScopeInput {
  q?: string;
  modules?: AuditModule[];
  actorTypes?: AuditActorType[];
  entityTypes?: AuditEntityType[];
  dateFrom?: string;
  dateTo?: string;
  page: number;
  pageSize: number;
  sortDir: "asc" | "desc";
}

export interface AuditListResult {
  items: AuditListItemView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditStatistics {
  eventsToday: number;
  byModule: Record<AuditModule, number>;
}
