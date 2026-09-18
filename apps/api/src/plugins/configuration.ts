import type { FastifyInstance } from "fastify";
import { ConfigurationService } from "../domain/configuration/service.js";
import {
  DrizzleConfigurationRepository,
  type ConfigurationRepository,
} from "../domain/configuration/repository.js";

export interface RegisterConfigurationOverrides {
  /** Injectable for tests — bypasses the real Postgres connection entirely.
   * Production (app.ts, no override) always uses
   * DrizzleConfigurationRepository. */
  configurationRepository?: ConfigurationRepository;
}

/**
 * Registers the Enterprise Configuration Center's service (Phase 5,
 * Prompt 14). Unlike `plugins/staff.ts`, this domain needs no external
 * Admin API client and no fail-secure-at-registration credential check —
 * `configuration_entries` is an ordinary, entirely DB-backed table.
 */
export function registerConfiguration(
  app: FastifyInstance<any, any, any, any, any>, // eslint-disable-line @typescript-eslint/no-explicit-any -- see plugins/staff.ts
  overrides: RegisterConfigurationOverrides = {},
): void {
  const repository = overrides.configurationRepository ?? new DrizzleConfigurationRepository();
  app.decorate("configurationService", new ConfigurationService(repository));
}
