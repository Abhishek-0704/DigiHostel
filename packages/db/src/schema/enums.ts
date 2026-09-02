import { pgEnum } from "drizzle-orm/pg-core";

// Shared across schema files — see docs/database-schema-design.md for the
// domain rationale behind each enum.

export const staffRole = pgEnum("staff_role", [
  "reception_warden",
  "library_incharge",
  "hostel_admin",
  "super_admin",
]);

export const parentRelationshipType = pgEnum("parent_relationship_type", [
  "father",
  "mother",
  "guardian",
]);

export const leaveRequestStatus = pgEnum("leave_request_status", [
  "pending",
  "father_notified",
  "mother_notified",
  "guardian_notified",
  "approved",
  "rejected",
  "in_app_call",
  "manual_verification",
  "expired",
]);

export const approvalEventType = pgEnum("approval_event_type", [
  "notified",
  "responded",
  "escalated",
  "expired",
  "manual_override",
]);

export const approvalResponse = pgEnum("approval_response", [
  "approved",
  "rejected",
  "no_response",
]);

export const devicePlatform = pgEnum("device_platform", ["ios", "android"]);

export const attestationProvider = pgEnum("attestation_provider", [
  "play_integrity",
  "app_attest",
  "device_check",
]);

export const attestationResult = pgEnum("attestation_result", ["pass", "fail"]);

export const libraryPassStatus = pgEnum("library_pass_status", ["active", "closed"]);

export const checkpointType = pgEnum("checkpoint_type", [
  "hostel_exit",
  "library_entry",
  "library_exit",
  "hostel_return",
]);

export const notificationRecipientType = pgEnum("notification_recipient_type", [
  "parent",
  "student",
]);

export const notificationStatus = pgEnum("notification_status", [
  "queued",
  "sent",
  "delivered",
  "failed",
]);

export const auditActorType = pgEnum("audit_actor_type", ["student", "parent", "staff", "system"]);

export const securityIncidentType = pgEnum("security_incident_type", [
  "missed_checkpoint",
  "manual_flag",
]);

export const securityIncidentStatus = pgEnum("security_incident_status", [
  "open",
  "escalated",
  "resolved",
]);
