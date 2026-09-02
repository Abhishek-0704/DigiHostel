import type { AuthDbPort } from "./db-port.js";
import type { AppProfile } from "./types.js";

/**
 * Resolves a verified Supabase Auth identity (auth.users.id) to the
 * corresponding DigiHostel application profile — student, parent, or staff.
 * Uses the existing foreign-key model (each profile table's `auth_user_id`
 * column, per docs/database-schema-design.md §Identity/Profile Domain); no
 * new identity table is introduced.
 *
 * A user can have a valid Supabase session with NO matching profile row yet
 * (e.g. Auth account created before the app-side profile was provisioned) —
 * this returns `{ kind: "none" }` rather than throwing, so callers
 * (guards.ts) can distinguish that case cleanly from "unauthenticated" and
 * from "authenticated but wrong role" per this task's requirement.
 *
 * Checks student -> parent -> staff in that order and returns the first
 * match. A single auth_user_id is not expected to match more than one
 * profile table (each table's auth_user_id is unique — see
 * docs/database-schema-design.md); if that invariant is ever violated this
 * still returns a single, defined profile rather than an ambiguous result.
 */
export async function resolveAppProfile(
  authUserId: string,
  dbPort: AuthDbPort,
): Promise<AppProfile> {
  const student = await dbPort.findStudentByAuthUserId(authUserId);
  if (student) {
    return { kind: "student", id: student.id, hostelId: student.hostelId };
  }

  const parent = await dbPort.findParentByAuthUserId(authUserId);
  if (parent) {
    return { kind: "parent", id: parent.id };
  }

  const staffMember = await dbPort.findStaffByAuthUserId(authUserId);
  if (staffMember) {
    return {
      kind: "staff",
      id: staffMember.id,
      role: staffMember.role,
      hostelId: staffMember.hostelId,
    };
  }

  return { kind: "none" };
}
