import { pgEnum } from "drizzle-orm/pg-core";

// Shared across schema files — see docs/database-schema-design.md for the
// domain rationale behind each enum.

export const staffRole = pgEnum("staff_role", [
  "reception_warden",
  "library_incharge",
  "hostel_admin",
  "super_admin",
]);

// Phase 5, Prompt 13 — Identity & Access Administration Center. The
// minimal, safe representation of "can this staff member authenticate into
// the Reception Dashboard right now" — deliberately just two states, not a
// speculative lock/archive/deactivate taxonomy invented for the UI. See
// packages/db/src/schema/identity.ts's `staff.status` column doc comment
// for the enforcement mechanism (request-time, not merely at login).
export const staffStatus = pgEnum("staff_status", ["active", "suspended"]);

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

// Phase 4, Prompt 10 — Emergency Operations Center. `missed_checkpoint`/
// `manual_flag` are the ORIGINAL two values — automated/ad-hoc signals from
// the still-unbuilt Digital Library Pass checkpoint-monitoring domain (SDD
// Ch.6). Reconnaissance before this prompt confirmed `security_incidents` is
// the SDD's own single canonical incident table for this whole domain
// (docs/database.md's entity list; docs/reception-dashboard-architecture.md
// names it as the intended backing store for BOTH "Emergency Management"
// and the future "Health Alerts" module) — so the eight categories below are
// ADDED to this same enum/table, not modeled as a second, competing
// "emergency incidents" table. Purely additive (`ALTER TYPE ... ADD VALUE`):
// the two original values, and every existing row/pgTAP fixture that uses
// them, are completely unaffected.
export const securityIncidentType = pgEnum("security_incident_type", [
  "missed_checkpoint",
  "manual_flag",
  "medical",
  "personal_safety",
  "fire",
  "security_threat",
  "violence",
  "infrastructure",
  "harassment",
  "other",
]);

// `open`/`escalated`/`resolved` are the ORIGINAL three values (still used
// exactly as before by the pre-existing checkpoint-monitoring domain and its
// pgTAP coverage, supabase/tests/database/13.../14...sql). `acknowledged`/
// `in_progress`/`closed` are ADDED for the Emergency Operations Center's own
// richer staff-response lifecycle (see domain/emergency/types.ts's
// `INCIDENT_TRANSITIONS` for the exact, server-enforced transition matrix —
// `escalated` is deliberately NOT part of that matrix: it already exists for
// the original checkpoint domain, but no concrete EOC requirement justifies
// wiring an "Escalate" action to it in this prompt, so it is left reserved
// rather than given fabricated new semantics).
export const securityIncidentStatus = pgEnum("security_incident_status", [
  "open",
  "escalated",
  "resolved",
  "acknowledged",
  "in_progress",
  "closed",
]);

// New for Prompt 10 — no existing column represented incident priority. UI
// levels named by the product principle (Critical/High/Medium/Low/
// Informational); "severity" is the term used throughout, matching common
// security-incident-domain terminology and this table's own name.
export const securityIncidentSeverity = pgEnum("security_incident_severity", [
  "critical",
  "high",
  "medium",
  "low",
  "informational",
]);

// The Emergency Operations Center's own append-only operational timeline —
// mirrors `leave_approval_events`'s established shape/discipline exactly
// (one immutable row per lifecycle transition or note), not a second audit
// system: `audit_logs` (service-role-only, no client RLS) remains the
// compliance-grade record every mutation also writes to; this table is the
// RLS-scoped, staff/student/parent-visible operational history the EOC UI
// actually renders as a timeline.
export const securityIncidentEventType = pgEnum("security_incident_event_type", [
  "created",
  "acknowledged",
  "response_started",
  "note_added",
  "resolved",
  "closed",
]);

// Phase 4, Prompt 11 — Health Operations Center
// (packages/db/src/schema/health.ts). A NEW, structurally parallel domain to
// the Emergency Operations Center (Prompt 10) — reconnaissance before this
// prompt considered extending `security_incidents` further (as its own
// Prompt 10 doc comments speculated the future "Health Alerts" module
// might), but found that would be architecturally unsound: the EOC's own
// 5-state `open -> closed` lifecycle and its `medical` incident_type value
// already occupy that table/column for ACUTE, staff-attested incidents,
// whereas a health case is a materially different, longer-lived
// case-tracking concept (monitoring, awaiting_update, admission/discharge).
// Sharing one status column between two unrelated state machines, or
// reusing `incident_type = 'medical'` to mean two different things, would
// be ambiguous and fragile. This domain therefore reuses the EOC's own
// PATTERN (immutable timeline, forged-actor RLS, hostel scoping) via a new,
// separate table pair, not the table itself. `severity` is deliberately
// NOT duplicated here — health_cases.severity reuses the existing
// `security_incident_severity` enum directly (packages/db/src/schema/audit.ts),
// since the same critical/high/medium/low/informational vocabulary applies
// with no product reason for a second, competing concept.
export const healthCaseCategory = pgEnum("health_case_category", [
  "hospital_admission",
  "medical_observation",
  "emergency_admission",
  "outpatient_visit",
  "discharge",
  "medical_follow_up",
  "accident",
  "other_medical_event",
]);

// `new` (initial report) -> `acknowledged` (staff owns it) -> `monitoring`
// (actively tracked) <-> `awaiting_update` (waiting on an external status,
// e.g. a hospital) -> `resolved` (situation over, no discharge involved) OR
// `discharged` (was admitted, now discharged) -> `closed` (administratively
// closed). `cancelled` is reachable only from `new` (false alarm/duplicate
// report). See domain/health/types.ts's `HEALTH_CASE_TRANSITIONS` for the
// exact, server-enforced transition matrix — every state here is wired to a
// real transition, none is speculative.
export const healthCaseStatus = pgEnum("health_case_status", [
  "new",
  "acknowledged",
  "monitoring",
  "awaiting_update",
  "resolved",
  "discharged",
  "closed",
  "cancelled",
]);

// One value per real, server-enforced transition (domain/health/types.ts) —
// no speculative event with no producer (matches movementType's own
// established discipline above).
export const healthCaseEventType = pgEnum("health_case_event_type", [
  "created",
  "acknowledged",
  "monitoring_started",
  "awaiting_update",
  "update_received",
  "note_added",
  "resolved",
  "discharge_recorded",
  "closed",
  "cancelled",
]);

// Phase 4, Prompt 9 — Movement Engine (packages/db/src/schema/movement.ts).
// Deliberately its own enum, never sharing library.ts's `checkpoint_type`
// vocabulary (which belongs entirely to the separate Digital Library Pass
// domain and already has its own unrelated "hostel_return" value) — a
// future movement type is added as a new value here, not by reinterpreting
// checkpoint_type. Only "hostel_return" is implemented; every other value
// this prompt's own Movement Engine principle names (library_exit,
// library_return, medical_exit, emergency, temporary_exit, hostel_transfer,
// visitor_entry) is deliberately NOT added — an enum value with no
// supporting business logic would be a speculative extension point, not a
// real one, per this task's own instruction not to implement future types.
export const movementType = pgEnum("movement_type", ["hostel_return"]);

// Phase 5, Prompt 14 — Enterprise Configuration Center
// (packages/db/src/schema/configuration.ts). `global` applies platform-wide;
// `hostel` applies to exactly one hostel, identified by
// `configuration_entries.hostel_id`. No `domain`/`module` scope value is
// modeled as a third enum member — reconnaissance found no existing
// architecture that would give a "domain-scoped but not hostel-scoped"
// setting a different authorization shape than global, so adding one now
// would be a speculative distinction with no enforcement behind it. A real
// future need can add a value here without a breaking change.
export const configurationScope = pgEnum("configuration_scope", ["global", "hostel"]);

// The four value shapes the generic editor/validator actually distinguishes
// (packages/db/src/schema/configuration.ts's own doc comment explains why
// `value` itself stays a single `jsonb` column rather than one column per
// type) — not a type system, just enough to drive server-side validation
// (is `value` the JSON shape `value_type` claims it is) and a type-aware
// frontend input control.
export const configurationValueType = pgEnum("configuration_value_type", [
  "string",
  "number",
  "boolean",
  "json",
]);
