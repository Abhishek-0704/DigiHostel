import { StatusBadge } from "../ui";
import type { StatusTone } from "../ui";
import type {
  HealthCaseCategory,
  HealthCaseSeverity,
  HealthCaseStatus,
} from "@digihostel/api-client-react";

/**
 * Health Operations Center badge vocabulary (Phase 4, Prompt 11). Built
 * entirely on the existing `StatusBadge` primitive (never color-only —
 * every tone is paired with an icon glyph AND a text label) — mirrors
 * `EmergencyBadges.tsx`'s exact discipline.
 */

const CATEGORY_LABEL: Record<HealthCaseCategory, string> = {
  hospital_admission: "Hospital Admission",
  medical_observation: "Medical Observation",
  emergency_admission: "Emergency Admission",
  outpatient_visit: "Outpatient Visit",
  discharge: "Discharge",
  medical_follow_up: "Medical Follow-up",
  accident: "Accident",
  other_medical_event: "Other",
};

export function healthCaseCategoryLabel(category: HealthCaseCategory): string {
  return CATEGORY_LABEL[category] ?? category;
}

const SEVERITY_LABEL: Record<HealthCaseSeverity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  informational: "Informational",
};

const SEVERITY_TONE: Record<HealthCaseSeverity, StatusTone> = {
  critical: "error",
  high: "warning",
  medium: "warning",
  low: "info",
  informational: "neutral",
};

export function HealthCaseSeverityBadge({ severity }: { severity: HealthCaseSeverity }) {
  return <StatusBadge label={SEVERITY_LABEL[severity]} tone={SEVERITY_TONE[severity]} />;
}

const STATUS_LABEL: Record<HealthCaseStatus, string> = {
  new: "New",
  acknowledged: "Acknowledged",
  monitoring: "Monitoring",
  awaiting_update: "Awaiting Update",
  resolved: "Resolved",
  discharged: "Discharged",
  closed: "Closed",
  cancelled: "Cancelled",
};

const STATUS_TONE: Record<HealthCaseStatus, StatusTone> = {
  new: "error",
  acknowledged: "warning",
  monitoring: "warning",
  awaiting_update: "info",
  resolved: "success",
  discharged: "success",
  closed: "neutral",
  cancelled: "neutral",
};

export function HealthCaseStatusBadge({ status }: { status: HealthCaseStatus }) {
  return <StatusBadge label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} />;
}

export function healthCaseStatusLabel(status: HealthCaseStatus): string {
  return STATUS_LABEL[status] ?? status;
}
