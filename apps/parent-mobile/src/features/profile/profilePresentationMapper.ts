import type { LinkedStudentRecord, ParentProfileRecord } from "../../services/profile/profile";
import type {
  LinkedStudentPresentation,
  ParentProfilePresentation,
  ParentRelationshipType,
} from "./types";

/**
 * Backend/session → presentation mapping (Prompt 11) — no React/RN import.
 */

export interface SessionProfileFields {
  email?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
}

export function buildParentProfilePresentation(
  parent: ParentProfileRecord | null,
  sessionUser: SessionProfileFields | null,
): ParentProfilePresentation {
  return {
    name: parent?.fullName ?? null,
    phoneNumber: parent?.phoneNumber ?? null,
    email: sessionUser?.email ?? null,
    accountCreatedAt: sessionUser?.created_at ?? null,
    lastLoginAt: sessionUser?.last_sign_in_at ?? null,
  };
}

export function mapLinkedStudentRecord(record: LinkedStudentRecord): LinkedStudentPresentation {
  return {
    id: record.id,
    name: record.fullName,
    rollNumber: record.rollNumber,
    hostel: record.hostelName,
    room: record.roomNumber,
    relationship: record.relationshipType,
  };
}

const RELATIONSHIP_LABELS: Record<ParentRelationshipType, string> = {
  father: "Father",
  mother: "Mother",
  guardian: "Guardian",
};

export function relationshipLabel(type: ParentRelationshipType): string {
  return RELATIONSHIP_LABELS[type];
}
