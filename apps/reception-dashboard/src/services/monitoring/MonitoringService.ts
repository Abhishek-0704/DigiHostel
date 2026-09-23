import {
  getMonitoringOverview,
  listMonitoringDiagnostics,
  runMonitoringDiagnostic,
  type MonitoringOverview,
  type DiagnosticDefinition,
  type DiagnosticResult,
} from "@digihostel/api-client-react";

/**
 * Enterprise Operations Monitoring Center (Phase 7, Prompt 18) — thin
 * transport wrapper, matching `AnalyticsService`/`AuditService`'s
 * established pattern exactly. The backend resolves the `system:view`
 * (super_admin-only) role boundary and every health/diagnostic signal
 * entirely server-side; this service performs no authorization or
 * computation of its own.
 */
export interface MonitoringService {
  getOverview(): Promise<MonitoringOverview>;
  listDiagnostics(): Promise<DiagnosticDefinition[]>;
  runDiagnostic(diagnosticId: string): Promise<DiagnosticResult>;
}

export const monitoringService: MonitoringService = {
  async getOverview() {
    return getMonitoringOverview();
  },
  async listDiagnostics() {
    const { diagnostics } = await listMonitoringDiagnostics();
    return diagnostics;
  },
  async runDiagnostic(diagnosticId) {
    return runMonitoringDiagnostic(diagnosticId);
  },
};

export type {
  MonitoringOverview,
  DiagnosticDefinition,
  DiagnosticResult,
  HealthState,
  HealthSignal,
  ApplicationModuleStatus,
  MonitoringAlert,
} from "@digihostel/api-client-react";
