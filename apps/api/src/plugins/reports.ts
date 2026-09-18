import type { FastifyInstance } from "fastify";
import { ReportsService, type ReportsServicePort } from "../domain/reports/service.js";
import { DrizzleReportsRepository, type ReportsRepository } from "../domain/reports/repository.js";
import { AnalyticsService } from "../domain/analytics/service.js";
import { DrizzleAnalyticsRepository } from "../domain/analytics/repository.js";
import { EmergencyService } from "../domain/emergency/service.js";
import { DrizzleEmergencyRepository } from "../domain/emergency/repository.js";
import { HealthService } from "../domain/health/service.js";
import { DrizzleHealthRepository } from "../domain/health/repository.js";
import { AuditService } from "../domain/audit/service.js";
import { DrizzleAuditRepository } from "../domain/audit/repository.js";

export interface RegisterReportsOverrides {
  /** Injectable for tests — bypasses the real Postgres connection entirely.
   * Production (app.ts, no override) always uses the real Drizzle-backed
   * ReportsService, wired to freshly-constructed instances of every domain
   * service it reuses (Analytics/Emergency/Health/Audit) — never the
   * `app.analyticsService`/etc. decorations those other plugins register,
   * since plugin registration order is not guaranteed and each of those
   * services is a cheap, stateless wrapper over its own repository (the
   * same construction every other plugin file in this codebase performs
   * for itself). */
  reportsService?: ReportsServicePort;
}

export function registerReports(
  app: FastifyInstance<any, any, any, any, any>, // eslint-disable-line @typescript-eslint/no-explicit-any -- see plugins/emergency.ts
  overrides: RegisterReportsOverrides = {},
): void {
  const service =
    overrides.reportsService ??
    new ReportsService(
      new DrizzleReportsRepository() as ReportsRepository,
      new AnalyticsService(new DrizzleAnalyticsRepository()),
      new EmergencyService(new DrizzleEmergencyRepository()),
      new HealthService(new DrizzleHealthRepository()),
      new AuditService(new DrizzleAuditRepository()),
    );
  app.decorate("reportsService", service);
}
