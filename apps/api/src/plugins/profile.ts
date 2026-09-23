import type { FastifyInstance } from "fastify";
import { ProfileService } from "../domain/profile/service.js";
import { DrizzleProfileRepository, type ProfileRepository } from "../domain/profile/repository.js";

export interface RegisterProfileOverrides {
  /** Injectable for tests — bypasses the real Postgres connection entirely.
   * Production (app.ts, no override) always uses DrizzleProfileRepository. */
  profileRepository?: ProfileRepository;
}

/** Registers the Administrative Profile & Personal Preferences Center's
 * service (Phase 7, Prompt 17) — mirrors `plugins/configuration.ts`
 * exactly: an ordinary, entirely DB-backed domain, no external client, no
 * fail-secure-at-registration credential check. */
export function registerProfile(
  app: FastifyInstance<any, any, any, any, any>, // eslint-disable-line @typescript-eslint/no-explicit-any -- see plugins/staff.ts
  overrides: RegisterProfileOverrides = {},
): void {
  const repository = overrides.profileRepository ?? new DrizzleProfileRepository();
  app.decorate("profileService", new ProfileService(repository));
}
