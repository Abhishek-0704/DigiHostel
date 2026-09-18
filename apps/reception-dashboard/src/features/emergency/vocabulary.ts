import {
  EmergencyCategory,
  EmergencySeverity,
  EmergencyStatus,
} from "@digihostel/api-client-react";

/**
 * Emergency Operations Center filter vocabulary (Phase 4, Prompt 10).
 * Derived from the generated const objects rather than retyped as a literal
 * array — the real backend enum (packages/db/src/schema/enums.ts) is the
 * one source of truth, matching `LEAVE_REQUEST_STATUSES`'s established
 * convention (features/leave/types.ts).
 */
export const EMERGENCY_CATEGORIES = Object.values(EmergencyCategory);
export const EMERGENCY_SEVERITIES = Object.values(EmergencySeverity);
export const EMERGENCY_STATUSES = Object.values(EmergencyStatus);
