import type { FastifyInstance } from "fastify";
import { EmergencyService } from "../domain/emergency/service.js";
import {
  DrizzleEmergencyRepository,
  type EmergencyRepository,
} from "../domain/emergency/repository.js";

export interface RegisterEmergencyOverrides {
  /** Injectable for tests — bypasses the real Postgres connection entirely.
   * Production (app.ts, no override) always uses DrizzleEmergencyRepository. */
  emergencyRepository?: EmergencyRepository;
}

// Same loose generic slots as plugins/movement.ts/plugins/student.ts, same
// reason (Fastify+pino generic-typing friction on a plain function call vs.
// app.register()).
export function registerEmergency(
  app: FastifyInstance<any, any, any, any, any>, // eslint-disable-line @typescript-eslint/no-explicit-any -- see plugins/movement.ts
  overrides: RegisterEmergencyOverrides = {},
): void {
  const repository = overrides.emergencyRepository ?? new DrizzleEmergencyRepository();
  app.decorate("emergencyService", new EmergencyService(repository));
}
