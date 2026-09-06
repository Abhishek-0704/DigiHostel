import { getSupabaseClient } from "../supabase/client";

/**
 * Profile/linked-student data service (Prompt 11) — direct Supabase reads
 * (and one real write), mirroring the exact pattern already established by
 * `deviceService.listTrustedDevices()` (Prompt 3/6) and
 * `notificationService.listNotifications()` (Prompt 8): a genuine RLS
 * SELECT/UPDATE grant, read/written directly via the Supabase client, never
 * a fabricated value.
 *
 * Real, RLS-verified grants this service relies on
 * (`packages/db/src/schema/identity.ts`, `hostel.ts`):
 * - `parents_select_own` / `parents_update_own` — a parent may read AND
 *   update their OWN `parents` row (`auth_user_id = auth.uid()`).
 * - `students_select_linked_parent` — a parent may read a linked student's
 *   row (`is_parent_linked_to_student`).
 * - `psr_select_own_parent` — a parent may read their OWN
 *   `parent_student_relationships` rows (which student, which relationship
 *   type).
 * - `hostels_select_authenticated` / `rooms_select_authenticated` — openly
 *   readable by any authenticated role.
 *
 * Only `fullName` is ever written here — `phoneNumber` is deliberately
 * read-only from this screen even though `parents_update_own` would
 * technically permit updating it too: `parents.phone_number` is the field
 * ADR-020's OTP pre-check design matches against
 * (`services/supabase/auth.ts`'s own doc comment), so changing it has a
 * real authentication-identity implication beyond ordinary profile display
 * data — out of this prompt's "do not modify authentication identity
 * ownership without explicit architectural support" boundary.
 *
 * NOTE: the linked-student join below (`listLinkedStudents`) was written
 * against the real schema/RLS but has not been exercised against a live
 * Supabase instance in this environment (no local Supabase/Docker stack
 * was running — see `docs/profile.md`'s native-verification section). It
 * deliberately uses only the same plain `.select()/.in()` query shape
 * already proven working elsewhere in this app, not an untested nested
 * embed, to minimize that risk.
 */

export interface ParentProfileRecord {
  id: string;
  fullName: string;
  phoneNumber: string;
  createdAt: string;
  updatedAt: string;
}

export type ParentRelationshipType = "father" | "mother" | "guardian";

export interface LinkedStudentRecord {
  id: string;
  fullName: string;
  rollNumber: string;
  hostelName: string | null;
  roomNumber: string | null;
  relationshipType: ParentRelationshipType;
}

export interface UpdateParentProfileInput {
  fullName: string;
}

export interface ProfileService {
  getParentProfile(): Promise<ParentProfileRecord>;
  updateParentProfile(input: UpdateParentProfileInput): Promise<ParentProfileRecord>;
  listLinkedStudents(): Promise<LinkedStudentRecord[]>;
}

interface ParentRow {
  id: string;
  full_name: string;
  phone_number: string;
  created_at: string;
  updated_at: string;
}

function mapParentRow(row: ParentRow): ParentProfileRecord {
  return {
    id: row.id,
    fullName: row.full_name,
    phoneNumber: row.phone_number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const profileService: ProfileService = {
  async getParentProfile() {
    const { data, error } = await getSupabaseClient()
      .from("parents")
      .select("id, full_name, phone_number, created_at, updated_at")
      .single();
    if (error) throw error;
    return mapParentRow(data as ParentRow);
  },

  async updateParentProfile({ fullName }) {
    const trimmed = fullName.trim();
    const { data, error } = await getSupabaseClient()
      .from("parents")
      .update({ full_name: trimmed })
      .select("id, full_name, phone_number, created_at, updated_at")
      .single();
    if (error) throw error;
    return mapParentRow(data as ParentRow);
  },

  async listLinkedStudents() {
    const client = getSupabaseClient();

    const { data: relationships, error: relError } = await client
      .from("parent_student_relationships")
      .select("student_id, relationship_type");
    if (relError) throw relError;
    if (!relationships || relationships.length === 0) return [];

    const studentIds = relationships.map((row) => row.student_id as string);
    const { data: students, error: studentsError } = await client
      .from("students")
      .select("id, full_name, roll_number, hostel_id, room_id")
      .in("id", studentIds);
    if (studentsError) throw studentsError;

    const hostelIds = [
      ...new Set(
        (students ?? [])
          .map((s) => s.hostel_id as string | null)
          .filter((v): v is string => Boolean(v)),
      ),
    ];
    const roomIds = [
      ...new Set(
        (students ?? [])
          .map((s) => s.room_id as string | null)
          .filter((v): v is string => Boolean(v)),
      ),
    ];

    const [hostelsResult, roomsResult] = await Promise.all([
      hostelIds.length > 0
        ? client.from("hostels").select("id, name").in("id", hostelIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
      roomIds.length > 0
        ? client.from("rooms").select("id, room_number").in("id", roomIds)
        : Promise.resolve({ data: [] as { id: string; room_number: string }[], error: null }),
    ]);
    if (hostelsResult.error) throw hostelsResult.error;
    if (roomsResult.error) throw roomsResult.error;

    const hostelNameById = new Map((hostelsResult.data ?? []).map((h) => [h.id, h.name]));
    const roomNumberById = new Map((roomsResult.data ?? []).map((r) => [r.id, r.room_number]));

    return relationships
      .map((rel) => {
        const student = (students ?? []).find((s) => s.id === rel.student_id);
        if (!student) return null;
        return {
          id: student.id as string,
          fullName: student.full_name as string,
          rollNumber: student.roll_number as string,
          hostelName: student.hostel_id
            ? (hostelNameById.get(student.hostel_id as string) ?? null)
            : null,
          roomNumber: student.room_id
            ? (roomNumberById.get(student.room_id as string) ?? null)
            : null,
          relationshipType: rel.relationship_type as ParentRelationshipType,
        };
      })
      .filter((record): record is LinkedStudentRecord => record !== null);
  },
};
