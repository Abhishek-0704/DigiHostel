import { StatusBadge } from "../ui";
import type { StatusTone } from "../ui";
import type {
  EmergencyCategory,
  EmergencySeverity,
  EmergencyStatus,
} from "@digihostel/api-client-react";

/**
 * Emergency Operations Center badge vocabulary (Phase 4, Prompt 10). Built
 * entirely on the existing `StatusBadge` primitive (never color-only — every
 * tone is paired with an icon glyph AND a text label, `StatusBadge`'s own
 * established accessibility discipline) rather than a new badge component.
 */

const CATEGORY_LABEL: Record<EmergencyCategory, string> = {
  medical: "Medical",
  personal_safety: "Personal Safety",
  fire: "Fire",
  security_threat: "Security",
  violence: "Violence",
  infrastructure: "Infrastructure",
  harassment: "Harassment",
  other: "Other",
};

export function emergencyCategoryLabel(category: EmergencyCategory): string {
  return CATEGORY_LABEL[category] ?? category;
}

const SEVERITY_LABEL: Record<EmergencySeverity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  informational: "Informational",
};

const SEVERITY_TONE: Record<EmergencySeverity, StatusTone> = {
  critical: "error",
  high: "warning",
  medium: "warning",
  low: "info",
  informational: "neutral",
};

export function EmergencySeverityBadge({ severity }: { severity: EmergencySeverity }) {
  return <StatusBadge label={SEVERITY_LABEL[severity]} tone={SEVERITY_TONE[severity]} />;
}

const STATUS_LABEL: Record<EmergencyStatus, string> = {
  open: "New",
  acknowledged: "Acknowledged",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

const STATUS_TONE: Record<EmergencyStatus, StatusTone> = {
  open: "error",
  acknowledged: "warning",
  in_progress: "warning",
  resolved: "success",
  closed: "neutral",
};

export function EmergencyStatusBadge({ status }: { status: EmergencyStatus }) {
  return <StatusBadge label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} />;
}

export function emergencyStatusLabel(status: EmergencyStatus): string {
  return STATUS_LABEL[status] ?? status;
}
