import type { FastifyInstance } from "fastify";
import { HealthService } from "../domain/health/service.js";
import { DrizzleHealthRepository, type HealthRepository } from "../domain/health/repository.js";

export interface RegisterHealthCaseOverrides {
  /** Injectable for tests — bypasses the real Postgres connection entirely.
   * Production (app.ts, no override) always uses DrizzleHealthRepository. */
  healthRepository?: HealthRepository;
}

// Same loose generic slots as plugins/emergency.ts, same reason (Fastify+
// pino generic-typing friction on a plain function call vs. app.register()).
export function registerHealthCase(
  app: FastifyInstance<any, any, any, any, any>, // eslint-disable-line @typescript-eslint/no-explicit-any -- see plugins/movement.ts
  overrides: RegisterHealthCaseOverrides = {},
): void {
  const repository = overrides.healthRepository ?? new DrizzleHealthRepository();
  app.decorate("healthService", new HealthService(repository));
}
