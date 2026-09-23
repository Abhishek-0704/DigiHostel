import type { AnalyticsService } from "../analytics/service.js";
import type { EmergencyService } from "../emergency/service.js";
import type { HealthService } from "../health/service.js";
import type { MonitoringRepository } from "./repository.js";
import { DIAGNOSTIC_DEFINITIONS, findDiagnostic } from "./diagnostics.js";
import {
  worstHealthState,
  type DiagnosticDefinition,
  type DiagnosticResult,
  type MonitoringOverview,
  type MonitoringScope,
  type ApplicationModuleStatus,
  type HealthState,
} from "./types.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Every currently-implemented Reception Dashboard module (Prompt 18 §9).
 * Deliberately NOT represented as independent microservices with their own
 * uptime — they are pages/route-groups served by the same `apps/api`
 * process and the same Postgres connection, so their genuinely-truthful
 * status is "operationally available through Reception API, coupled to
 * this platform's own core infrastructure health" — never a fabricated
 * independent SLA. */
const APPLICATION_MODULES: readonly { id: string; label: string }[] = [
  { id: "reception-dashboard", label: "Reception Dashboard" },
  { id: "authentication", label: "Authentication Service" },
  { id: "notification-center", label: "Notification Center" },
  { id: "student-operations", label: "Student Operations" },
  { id: "student-movement", label: "Student Movement" },
  { id: "emergency-operations", label: "Emergency Operations" },
  { id: "health-operations", label: "Health Operations" },
  { id: "audit-center", label: "Enterprise Audit Center" },
  { id: "identity-admin", label: "Identity & Access Administration" },
  { id: "configuration-center", label: "Enterprise Configuration" },
  { id: "operational-intelligence", label: "Operational Intelligence" },
  { id: "enterprise-reporting", label: "Enterprise Reporting" },
  { id: "profile-center", label: "Administrative Profile Center" },
] as const;

function resolveVersion(): string {
  return process.env.RENDER_GIT_COMMIT ?? process.env.BUILD_SHA ?? "unknown";
}

function resolveEnvironment(): string {
  return process.env.NODE_ENV ?? "development";
}

/**
 * Enterprise Operations Monitoring Center (Phase 7, Prompt 18). Aggregates
 * genuinely-measured infrastructure signals with read-only reuse of
 * already-certified domain services — this class introduces NO new
 * business logic of its own for operational/security data, only
 * aggregation and honest classification (§12/§22 — "reuse existing
 * services/repositories," "do not create services that merely wrap one
 * line of code" is respected by keeping this the ONE place that composes
 * them, rather than duplicating the composition in the route handler).
 */
export class MonitoringService {
  constructor(
    private readonly repository: MonitoringRepository,
    private readonly deps: {
      analyticsService: AnalyticsService;
      emergencyService: EmergencyService;
      healthService: HealthService;
    },
  ) {}

  listDiagnostics(): DiagnosticDefinition[] {
    return DIAGNOSTIC_DEFINITIONS.map(({ id, label, description }) => ({ id, label, description }));
  }

  async runDiagnostic(diagnosticId: string): Promise<DiagnosticResult | null> {
    const definition = findDiagnostic(diagnosticId);
    if (!definition) return null;
    const start = Date.now();
    const executedAt = new Date().toISOString();
    try {
      const { status, detail } = await definition.run(this.repository);
      return {
        id: definition.id,
        label: definition.label,
        status,
        detail,
        durationMs: Date.now() - start,
        executedAt,
      };
    } catch (err) {
      return {
        id: definition.id,
        label: definition.label,
        status: "unavailable",
        detail: err instanceof Error ? err.message : "Diagnostic execution failed",
        durationMs: Date.now() - start,
        executedAt,
      };
    }
  }

  async getOverview(scope: MonitoringScope): Promise<MonitoringOverview> {
    const generatedAt = new Date().toISOString();
    const since24h = new Date(Date.now() - ONE_DAY_MS).toISOString();
    const nowRange = { dateFrom: since24h, dateTo: generatedAt };

    const [database, supabaseAuth, realtimePublication] = await Promise.all([
      this.repository.checkDatabaseConnectivity(),
      this.repository.checkSupabaseAuth(),
      this.repository.checkRealtimePublication(),
    ]);
    const infrastructure = [database, supabaseAuth, realtimePublication];
    const platformStatus = worstHealthState(infrastructure.map((s) => s.state));

    // Every listed module is a route-group served by this SAME apps/api
    // process over this SAME Postgres connection (§9's "strongest truthful
    // signal available") — its state directly mirrors platformStatus
    // rather than an invented independent per-module SLA. `warning` is
    // treated the same as `healthy` here (a warning-level infra signal,
    // e.g. a realtime-publication gap, does not necessarily block a given
    // module's own request path) but `unknown`/`degraded`/`unavailable`
    // must propagate — this backend genuinely cannot claim a module is
    // healthy while its own shared infrastructure is unproven or impaired.
    const moduleState: HealthState = platformStatus === "warning" ? "healthy" : platformStatus;
    const applicationModules: ApplicationModuleStatus[] = APPLICATION_MODULES.map((m) => ({
      id: m.id,
      label: m.label,
      state: moduleState,
      detail:
        moduleState === "healthy"
          ? "Operationally available through Reception API"
          : moduleState === "unknown"
            ? "Shared platform infrastructure status could not be fully verified"
            : "Shared platform infrastructure is impaired — this module's own routes depend on it",
    }));

    const [
      analyticsOverview,
      emergencyStats,
      healthStats,
      suspendedStaffCount,
      mfaFailures,
      adminChanges,
    ] = await Promise.all([
      this.deps.analyticsService.getOverview({
        staffId: scope.staffId,
        staffRole: "super_admin",
        ...nowRange,
      }),
      this.deps.emergencyService.getStatistics({
        staffId: scope.staffId,
        staffRole: "super_admin",
      }),
      this.deps.healthService.getStatistics({ staffId: scope.staffId, staffRole: "super_admin" }),
      this.repository.countSuspendedStaff(),
      this.repository.countRecentAuditAction("staff_mfa_failure", since24h),
      this.repository.countRecentAuditActions(
        ["staff.role_changed", "staff.hostel_changed", "staff.force_signed_out"],
        since24h,
      ),
    ]);

    return {
      generatedAt,
      platformStatus,
      infrastructure,
      applicationModules,
      operational: {
        pendingLeaveAuthorizations: analyticsOverview.leave.pendingNow,
        studentsOutsideHostel: analyticsOverview.presence.studentsOutside,
        activeEmergencies: emergencyStats.active,
        criticalEmergencies: emergencyStats.critical,
        activeHealthCases: healthStats.active,
        criticalHealthCases: healthStats.critical,
        notificationsFailedLast24h: analyticsOverview.notifications.failedInPeriod,
        libraryOperationsStatus: "future",
      },
      security: {
        recentMfaFailures24h: mfaFailures,
        suspendedStaffAccounts: suspendedStaffCount,
        recentAdministrativeChanges24h: adminChanges,
      },
      deployment: {
        version: resolveVersion(),
        environment: resolveEnvironment(),
      },
      alerts: deriveAlerts({
        platformStatus,
        infrastructure,
        emergencyCritical: emergencyStats.critical,
        healthCritical: healthStats.critical,
        mfaFailures,
      }),
    };
  }
}

/**
 * Alert Management Strategy (Prompt 18 §18): derived live from the same
 * health signals every request, never persisted. No acknowledgement/
 * lifecycle is implemented in this version — there is no existing consumer
 * that needs an alert to survive past the request that produced it, and
 * inventing a persistence layer (ownership, RLS, audit) for a capability
 * nothing yet requires would be exactly the "unnecessary complexity" this
 * codebase's own conventions warn against (see docs/monitoring-center.md
 * §6 for the explicit deferred-scope note).
 */
function deriveAlerts(input: {
  platformStatus: HealthState;
  infrastructure: { id: string; label: string; state: HealthState; detail: string }[];
  emergencyCritical: number;
  healthCritical: number;
  mfaFailures: number;
}) {
  const alerts: MonitoringOverview["alerts"] = [];
  for (const signal of input.infrastructure) {
    if (signal.state === "unavailable" || signal.state === "degraded") {
      alerts.push({
        id: `infra-${signal.id}`,
        severity: signal.state === "unavailable" ? "critical" : "warning",
        title: `${signal.label} ${signal.state}`,
        detail: signal.detail,
        source: "infrastructure",
      });
    }
  }
  if (input.emergencyCritical > 0) {
    alerts.push({
      id: "operational-emergency-critical",
      severity: "critical",
      title: `${input.emergencyCritical} critical emergency incident(s) open`,
      detail: "See the Emergency Operations Center for details.",
      source: "operational",
    });
  }
  if (input.healthCritical > 0) {
    alerts.push({
      id: "operational-health-critical",
      severity: "critical",
      title: `${input.healthCritical} critical health case(s) open`,
      detail: "See the Health Operations Center for details.",
      source: "operational",
    });
  }
  if (input.mfaFailures >= 5) {
    alerts.push({
      id: "security-mfa-failures",
      severity: "warning",
      title: `${input.mfaFailures} failed MFA attempts in the last 24 hours`,
      detail: "See the Enterprise Audit Center for the affected accounts.",
      source: "security",
    });
  }
  return alerts;
}
