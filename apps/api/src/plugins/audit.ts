import type { FastifyInstance } from "fastify";
import { AuditService } from "../domain/audit/service.js";
import { DrizzleAuditRepository, type AuditRepository } from "../domain/audit/repository.js";

export interface RegisterAuditOverrides {
  /** Injectable for tests — bypasses the real Postgres connection entirely.
   * Production (app.ts, no override) always uses DrizzleAuditRepository. */
  auditRepository?: AuditRepository;
}

export function registerAudit(
  app: FastifyInstance<any, any, any, any, any>, // eslint-disable-line @typescript-eslint/no-explicit-any -- see plugins/emergency.ts
  overrides: RegisterAuditOverrides = {},
): void {
  const repository = overrides.auditRepository ?? new DrizzleAuditRepository();
  app.decorate("auditService", new AuditService(repository));
}
