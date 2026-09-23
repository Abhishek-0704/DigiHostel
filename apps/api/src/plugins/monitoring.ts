import type { FastifyInstance } from "fastify";
import { MonitoringService } from "../domain/monitoring/service.js";
import {
  DrizzleMonitoringRepository,
  type MonitoringRepository,
} from "../domain/monitoring/repository.js";
import { SupabaseAuthProbe, type SupabaseAuthProbePort } from "../domain/monitoring/authProbe.js";
import { AnalyticsService } from "../domain/analytics/service.js";
import { DrizzleAnalyticsRepository } from "../domain/analytics/repository.js";
import { EmergencyService } from "../domain/emergency/service.js";
import { DrizzleEmergencyRepository } from "../domain/emergency/repository.js";
import { HealthService } from "../domain/health/service.js";
import { DrizzleHealthRepository } from "../domain/health/repository.js";

export interface RegisterMonitoringOverrides {
  /** Full-service override — bypasses everything below entirely, matching
   * `plugins/reports.ts`'s own `reportsService` override shape. Takes
   * precedence over every other field on this interface. */
  monitoringService?: MonitoringService;
  /** Injectable for tests — bypasses the real Postgres connection AND the
   * real Supabase Admin API entirely. Production (app.ts, no override)
   * always uses DrizzleMonitoringRepository. */
  monitoringRepository?: MonitoringRepository;
  authProbe?: SupabaseAuthProbePort;
  /** Each sub-service this domain reuses is, like `plugins/reports.ts`'s
   * own established precedent, constructed as a FRESH instance here rather
   * than read off `app.analyticsService`/etc. — plugin registration order
   * is not guaranteed, and every one of these services is a cheap,
   * stateless wrapper over its own repository. Overridable independently
   * so a test can fake only the one domain it's exercising. Deliberately
   * does NOT include a staff-administration service: unlike Reports (which
   * genuinely reuses `AuditService` for a report), Monitoring's one
   * staff-derived figure (suspended account count) is answered directly by
   * `MonitoringRepository.countSuspendedStaff()` — reusing
   * `StaffAdminService` here would require a live Supabase Auth Admin API
   * credential just to construct this plugin at all (see
   * `domain/monitoring/repository.ts`'s doc comment on that method), which
   * would make Monitoring Center registration fail in any environment
   * without one, for a figure that needs nothing from that API. */
  analyticsService?: AnalyticsService;
  emergencyService?: EmergencyService;
  healthService?: HealthService;
}

/**
 * Enterprise Operations Monitoring Center (Phase 7, Prompt 18). Mirrors
 * `plugins/reports.ts`'s established "construct fresh instances of every
 * domain service reused" pattern exactly, for the identical reason: this
 * avoids depending on plugin registration order elsewhere in `app.ts`.
 *
 * Unlike `plugins/staff.ts`, a missing `SUPABASE_URL`/
 * `SUPABASE_SERVICE_ROLE_KEY` does NOT fail registration here — the
 * Supabase Auth Admin API check is one signal among several, not this
 * whole module's reason to exist, and Prompt 18 §5/§38 require an
 * unconfigured/unmeasurable dependency to surface as an honest `unknown`
 * signal at request time rather than crash the entire API process at boot.
 */
export function registerMonitoring(
  app: FastifyInstance<any, any, any, any, any>, // eslint-disable-line @typescript-eslint/no-explicit-any -- see plugins/emergency.ts
  overrides: RegisterMonitoringOverrides = {},
): void {
  function resolveAuthProbe(): SupabaseAuthProbePort | null {
    if (overrides.authProbe) return overrides.authProbe;
    if (overrides.monitoringRepository) return null; // repository fully overridden; probe unused
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) return null;
    return new SupabaseAuthProbe(supabaseUrl, serviceRoleKey);
  }

  const repository: MonitoringRepository =
    overrides.monitoringRepository ?? new DrizzleMonitoringRepository(resolveAuthProbe());

  const service =
    overrides.monitoringService ??
    new MonitoringService(repository, {
      analyticsService:
        overrides.analyticsService ?? new AnalyticsService(new DrizzleAnalyticsRepository()),
      emergencyService:
        overrides.emergencyService ?? new EmergencyService(new DrizzleEmergencyRepository()),
      healthService: overrides.healthService ?? new HealthService(new DrizzleHealthRepository()),
    });

  app.decorate("monitoringService", service);
}

declare module "fastify" {
  interface FastifyInstance {
    monitoringService: import("../domain/monitoring/service.js").MonitoringService;
  }
}
