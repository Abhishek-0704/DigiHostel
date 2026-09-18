import type { AuthDbPort } from "../db-port.js";
import type { StaffRole } from "../types.js";

/**
 * Deterministic in-memory fake of AuthDbPort for tests — no live database
 * connection. Fixture data is entirely synthetic (test-only ids, no real
 * student/parent data), mirroring the shape of supabase/seed.sql without
 * depending on it being loaded anywhere.
 */
export class FakeAuthDbPort implements AuthDbPort {
  students = new Map<string, { id: string; hostelId: string | null }>();
  parents = new Map<string, { id: string }>();
  staffMembers = new Map<string, { id: string; role: StaffRole; hostelId: string | null }>();
  /** QG-04 remediation, F-QG04-02: seconds-since-epoch invalidation
   * timestamp per staff auth id, mirroring `staff.sessions_invalidated_before`
   * — `undefined`/absent means "never invalidated," matching the real
   * column's NULL default. */
  staffSessionsInvalidatedBefore = new Map<string, number>();
  linkedPairs = new Set<string>(); // `${parentId}:${studentId}`
  activeDeviceParents = new Set<string>();

  async findStudentByAuthUserId(authUserId: string) {
    return this.students.get(authUserId) ?? null;
  }
  async findParentByAuthUserId(authUserId: string) {
    return this.parents.get(authUserId) ?? null;
  }
  async findStaffByAuthUserId(authUserId: string, tokenIssuedAtSeconds: number) {
    const invalidatedBefore = this.staffSessionsInvalidatedBefore.get(authUserId);
    if (invalidatedBefore !== undefined && tokenIssuedAtSeconds < invalidatedBefore) {
      return null;
    }
    return this.staffMembers.get(authUserId) ?? null;
  }
  async isParentLinkedToStudent(parentId: string, studentId: string) {
    return this.linkedPairs.has(`${parentId}:${studentId}`);
  }
  async hasActiveTrustedDevice(parentId: string) {
    return this.activeDeviceParents.has(parentId);
  }

  // --- fixture builders ---
  addStudent(authUserId: string, id: string, hostelId: string | null = null) {
    this.students.set(authUserId, { id, hostelId });
    return this;
  }
  addParent(authUserId: string, id: string) {
    this.parents.set(authUserId, { id });
    return this;
  }
  addStaff(authUserId: string, id: string, role: StaffRole, hostelId: string | null = null) {
    this.staffMembers.set(authUserId, { id, role, hostelId });
    return this;
  }
  /** QG-04 remediation, F-QG04-02 test helper — simulates Force Sign-Out
   * having been triggered at `atSeconds` (seconds since epoch) for this
   * staff auth id. */
  invalidateStaffSessionsBefore(authUserId: string, atSeconds: number) {
    this.staffSessionsInvalidatedBefore.set(authUserId, atSeconds);
    return this;
  }
  linkParentToStudent(parentId: string, studentId: string) {
    this.linkedPairs.add(`${parentId}:${studentId}`);
    return this;
  }
  setActiveDevice(parentId: string, active: boolean) {
    if (active) this.activeDeviceParents.add(parentId);
    else this.activeDeviceParents.delete(parentId);
    return this;
  }
}
