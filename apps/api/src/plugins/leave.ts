import type { FastifyInstance } from "fastify";
import { LeaveService } from "../domain/leave/service.js";
import { DrizzleLeaveRepository, type LeaveRepository } from "../domain/leave/repository.js";
import {
  AssertionPresenceBiometricFreshnessGate,
  type BiometricFreshnessGate,
} from "../lib/auth/security-gates.js";

export interface RegisterLeaveOverrides {
  /** Injectable for tests — bypasses the real Postgres connection entirely.
   * Production (app.ts, no override) always uses DrizzleLeaveRepository. */
  leaveRepository?: LeaveRepository;
  /** Injectable for tests. Production uses AssertionPresenceBiometricFreshnessGate
   * — an explicitly non-cryptographic placeholder, see security-gates.ts. */
  biometricGate?: BiometricFreshnessGate;
}

// Same loose generic slots as plugins/auth.ts, same reason (Fastify+pino
// generic-typing friction on a plain function call vs. app.register()).
export function registerLeave(
  app: FastifyInstance<any, any, any, any, any>, // eslint-disable-line @typescript-eslint/no-explicit-any -- see plugins/auth.ts
  overrides: RegisterLeaveOverrides = {},
): void {
  const repository = overrides.leaveRepository ?? new DrizzleLeaveRepository();
  const biometricGate = overrides.biometricGate ?? new AssertionPresenceBiometricFreshnessGate();

  app.decorate("leaveService", new LeaveService(repository, biometricGate));
}
