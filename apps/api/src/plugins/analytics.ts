import type { FastifyInstance } from "fastify";
import { AnalyticsService } from "../domain/analytics/service.js";
import {
  DrizzleAnalyticsRepository,
  type AnalyticsRepository,
} from "../domain/analytics/repository.js";

export interface RegisterAnalyticsOverrides {
  /** Injectable for tests — bypasses the real Postgres connection entirely.
   * Production (app.ts, no override) always uses DrizzleAnalyticsRepository. */
  analyticsRepository?: AnalyticsRepository;
}

export function registerAnalytics(
  app: FastifyInstance<any, any, any, any, any>, // eslint-disable-line @typescript-eslint/no-explicit-any -- see plugins/emergency.ts
  overrides: RegisterAnalyticsOverrides = {},
): void {
  const repository = overrides.analyticsRepository ?? new DrizzleAnalyticsRepository();
  app.decorate("analyticsService", new AnalyticsService(repository));
}
