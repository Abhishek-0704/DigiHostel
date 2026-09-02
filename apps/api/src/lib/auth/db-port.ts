import { and, eq, isNull } from "drizzle-orm";
import { db } from "@digihostel/db";
import {
  students,
  parents,
  staff,
  parentStudentRelationships,
  trustedDevices,
} from "@digihostel/db";
import type { StaffRole } from "./types.js";

/**
 * Narrow port over the exact queries the auth boundary needs — deliberately
 * NOT a generic "give me a db client" escape hatch. Real implementation
 * below is backed by @digihostel/db (packages/db, Drizzle + Supabase
 * Postgres per ADR-006/ADR-014). A fake implementing this same interface is
 * used in tests (see the various *.test.ts files in this directory) so auth
 * logic can be tested deterministically without a live database connection.
 *
 * Every method here mirrors a relationship the RLS policies in
 * docs/rls-policy-matrix.md also enforce — this is the Fastify-side half of
 * the same defense-in-depth model (docs/auth-database-security-model.md
 * §15-§16): even if a bug here let something through, RLS is still the
 * final backstop on the actual database operation.
 */
export interface AuthDbPort {
  findStudentByAuthUserId(
    authUserId: string,
  ): Promise<{ id: string; hostelId: string | null } | null>;
  findParentByAuthUserId(authUserId: string): Promise<{ id: string } | null>;
  findStaffByAuthUserId(
    authUserId: string,
  ): Promise<{ id: string; role: StaffRole; hostelId: string | null } | null>;
  isParentLinkedToStudent(parentId: string, studentId: string): Promise<boolean>;
  hasActiveTrustedDevice(parentId: string): Promise<boolean>;
}

export class DrizzleAuthDbPort implements AuthDbPort {
  async findStudentByAuthUserId(authUserId: string) {
    const rows = await db
      .select({ id: students.id, hostelId: students.hostelId })
      .from(students)
      .where(eq(students.authUserId, authUserId))
      .limit(1);
    return rows[0] ?? null;
  }

  async findParentByAuthUserId(authUserId: string) {
    const rows = await db
      .select({ id: parents.id })
      .from(parents)
      .where(eq(parents.authUserId, authUserId))
      .limit(1);
    return rows[0] ?? null;
  }

  async findStaffByAuthUserId(authUserId: string) {
    const rows = await db
      .select({ id: staff.id, role: staff.role, hostelId: staff.hostelId })
      .from(staff)
      .where(eq(staff.authUserId, authUserId))
      .limit(1);
    return rows[0]
      ? { id: rows[0].id, role: rows[0].role as StaffRole, hostelId: rows[0].hostelId }
      : null;
  }

  async isParentLinkedToStudent(parentId: string, studentId: string) {
    const rows = await db
      .select({ id: parentStudentRelationships.id })
      .from(parentStudentRelationships)
      .where(
        and(
          eq(parentStudentRelationships.parentId, parentId),
          eq(parentStudentRelationships.studentId, studentId),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async hasActiveTrustedDevice(parentId: string) {
    const rows = await db
      .select({ id: trustedDevices.id })
      .from(trustedDevices)
      .where(and(eq(trustedDevices.parentId, parentId), isNull(trustedDevices.revokedAt)))
      .limit(1);
    return rows.length > 0;
  }
}
