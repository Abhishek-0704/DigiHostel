import type { FastifyInstance } from "fastify";
import { MovementService } from "../domain/movement/service.js";
import {
  DrizzleMovementRepository,
  type MovementRepository,
} from "../domain/movement/repository.js";

export interface RegisterMovementOverrides {
  /** Injectable for tests — bypasses the real Postgres connection entirely.
   * Production (app.ts, no override) always uses DrizzleMovementRepository. */
  movementRepository?: MovementRepository;
}

// Same loose generic slots as plugins/leave.ts/plugins/student.ts, same
// reason (Fastify+pino generic-typing friction on a plain function call vs.
// app.register()).
export function registerMovement(
  app: FastifyInstance<any, any, any, any, any>, // eslint-disable-line @typescript-eslint/no-explicit-any -- see plugins/leave.ts
  overrides: RegisterMovementOverrides = {},
): void {
  const repository = overrides.movementRepository ?? new DrizzleMovementRepository();
  app.decorate("movementService", new MovementService(repository));
}
