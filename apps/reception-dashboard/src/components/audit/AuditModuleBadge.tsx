import { StatusBadge } from "../ui";
import type { StatusTone } from "../ui";
import type { AuditModule } from "@digihostel/api-client-react";

const MODULE_LABEL: Record<AuditModule, string> = {
  leave: "Leave",
  movement: "Movement",
  emergency: "Emergency",
  health: "Health",
  device: "Device Security",
  "staff-auth": "Staff Authentication",
  other: "Other",
};

/** Never color-only (§31): `StatusBadge` itself always pairs the tone with
 * both an icon glyph and the visible text label, matching
 * `LeaveStatusBadge`/`HealthCaseStatusBadge`'s established discipline. */
const MODULE_TONE: Record<AuditModule, StatusTone> = {
  leave: "info",
  movement: "info",
  emergency: "error",
  health: "warning",
  device: "neutral",
  "staff-auth": "neutral",
  other: "neutral",
};

export function auditModuleLabel(module: AuditModule): string {
  return MODULE_LABEL[module];
}

export function AuditModuleBadge({ module }: { module: AuditModule }) {
  return <StatusBadge label={MODULE_LABEL[module]} tone={MODULE_TONE[module]} />;
}
