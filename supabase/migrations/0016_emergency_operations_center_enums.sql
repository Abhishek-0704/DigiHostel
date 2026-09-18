-- Phase 4, Prompt 10 — Reception Dashboard Emergency Operations Center (EOC).
--
-- Split into its own migration, containing ONLY enum changes, because
-- Postgres forbids using a newly `ALTER TYPE ... ADD VALUE`d label within
-- the same transaction that added it (SQLSTATE 55P04, confirmed empirically
-- against this repository's own migration runner, which applies each file
-- as one transaction) — the follow-up migration
-- (0017_emergency_operations_center.sql) references these new labels in
-- CREATE POLICY/CREATE INDEX and therefore must run afterward, as its own,
-- separately-committed migration.
--
-- Reconnaissance confirmed `security_incidents` (0000_cute_korvac.sql) is
-- the SDD's own single canonical incident table for this whole domain (see
-- 0017's own header for the full rationale) — its existing two
-- incident_type values (missed_checkpoint, manual_flag) and three status
-- values (open/escalated/resolved) belong to the still-unbuilt Digital
-- Library Pass checkpoint-monitoring domain (SDD Ch.6) and are completely
-- unaffected by these purely additive labels.

ALTER TYPE "security_incident_type" ADD VALUE 'medical';--> statement-breakpoint
ALTER TYPE "security_incident_type" ADD VALUE 'personal_safety';--> statement-breakpoint
ALTER TYPE "security_incident_type" ADD VALUE 'fire';--> statement-breakpoint
ALTER TYPE "security_incident_type" ADD VALUE 'security_threat';--> statement-breakpoint
ALTER TYPE "security_incident_type" ADD VALUE 'violence';--> statement-breakpoint
ALTER TYPE "security_incident_type" ADD VALUE 'infrastructure';--> statement-breakpoint
ALTER TYPE "security_incident_type" ADD VALUE 'harassment';--> statement-breakpoint
ALTER TYPE "security_incident_type" ADD VALUE 'other';--> statement-breakpoint

ALTER TYPE "security_incident_status" ADD VALUE 'acknowledged';--> statement-breakpoint
ALTER TYPE "security_incident_status" ADD VALUE 'in_progress';--> statement-breakpoint
ALTER TYPE "security_incident_status" ADD VALUE 'closed';--> statement-breakpoint

CREATE TYPE "security_incident_severity" AS ENUM ('critical', 'high', 'medium', 'low', 'informational');--> statement-breakpoint
CREATE TYPE "security_incident_event_type" AS ENUM ('created', 'acknowledged', 'response_started', 'note_added', 'resolved', 'closed');
