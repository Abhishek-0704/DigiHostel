/**
 * Enterprise Operations Monitoring Center (Phase 7, Prompt 18).
 *
 * Platform Health Model — severity order, worst to best:
 *   unavailable > degraded > warning > unknown > healthy
 * `unknown` is deliberately NOT collapsed into `healthy`: a signal this
 * backend could not evaluate (e.g. a dependency call timed out for a reason
 * unrelated to the dependency itself) must never be reported as good news.
 * `platformStatus` (the single aggregate rolled up to the UI's top-level
 * badge) is the MAXIMUM severity across every entry in `infrastructure` —
 * application-module rows and operational/security counters do not feed the
 * aggregate (they are informational context, not infrastructure health).
 */
export const HEALTH_STATES = ["healthy", "warning", "degraded", "unavailable", "unknown"] as const;
export type HealthState = (typeof HEALTH_STATES)[number];

const HEALTH_STATE_SEVERITY: Record<HealthState, number> = {
  healthy: 0,
  unknown: 1,
  warning: 2,
  degraded: 3,
  unavailable: 4,
};

export function worstHealthState(states: HealthState[]): HealthState {
  if (states.length === 0) return "unknown";
  return states.reduce((worst, current) =>
    HEALTH_STATE_SEVERITY[current] > HEALTH_STATE_SEVERITY[worst] ? current : worst,
  );
}

export interface HealthSignal {
  id: string;
  label: string;
  state: HealthState;
  detail: string;
  measuredAt: string;
  latencyMs: number | null;
}

export interface ApplicationModuleStatus {
  id: string;
  label: string;
  state: HealthState;
  detail: string;
}

export interface MonitoringOperationalSummary {
  pendingLeaveAuthorizations: number;
  studentsOutsideHostel: number;
  activeEmergencies: number;
  criticalEmergencies: number;
  activeHealthCases: number;
  criticalHealthCases: number;
  /** `null` only if the underlying analytics aggregate itself could not be
   * computed (never a fabricated 0 standing in for "unknown"). */
  notificationsFailedLast24h: number | null;
  libraryOperationsStatus: "future";
}

export interface MonitoringSecuritySummary {
  recentMfaFailures24h: number;
  suspendedStaffAccounts: number;
  recentAdministrativeChanges24h: number;
}

export interface MonitoringDeploymentInfo {
  version: string;
  environment: string;
}

export type MonitoringAlertSeverity = "informational" | "warning" | "critical";

export interface MonitoringAlert {
  id: string;
  severity: MonitoringAlertSeverity;
  title: string;
  detail: string;
  source: string;
}

export interface MonitoringOverview {
  generatedAt: string;
  platformStatus: HealthState;
  infrastructure: HealthSignal[];
  applicationModules: ApplicationModuleStatus[];
  operational: MonitoringOperationalSummary;
  security: MonitoringSecuritySummary;
  deployment: MonitoringDeploymentInfo;
  alerts: MonitoringAlert[];
}

export interface DiagnosticDefinition {
  id: string;
  label: string;
  description: string;
}

export type DiagnosticStatus = "pass" | "fail" | "unavailable";

export interface DiagnosticResult {
  id: string;
  label: string;
  status: DiagnosticStatus;
  detail: string;
  durationMs: number;
  executedAt: string;
}

/** Always the caller's own resolved staff id (routes/monitoring.ts), never a
 * client-supplied value. No hostel-scope field: every route in this domain
 * is `super_admin`-only (reuses the existing `system:view` permission
 * boundary, granted to no other role), and `super_admin` is unscoped
 * everywhere else in this codebase — inventing a scope field here would be
 * dead code. */
export interface MonitoringScope {
  staffId: string;
}
