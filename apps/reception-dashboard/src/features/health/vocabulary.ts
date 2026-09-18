import {
  HealthCaseCategory,
  HealthCaseSeverity,
  HealthCaseStatus,
} from "@digihostel/api-client-react";

/**
 * Health Operations Center filter vocabulary (Phase 4, Prompt 11). Derived
 * from the generated const objects rather than retyped as a literal array —
 * matches `EMERGENCY_CATEGORIES`'s established convention.
 */
export const HEALTH_CASE_CATEGORIES = Object.values(HealthCaseCategory);
export const HEALTH_CASE_SEVERITIES = Object.values(HealthCaseSeverity);
export const HEALTH_CASE_STATUSES = Object.values(HealthCaseStatus);
