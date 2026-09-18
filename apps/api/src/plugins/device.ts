import type { FastifyInstance } from "fastify";
import { DeviceRegistrationService } from "../domain/device/service.js";
import {
  DrizzleChallengeRepository,
  type ChallengeRepository,
} from "../domain/device/challengeRepository.js";
import {
  PlayIntegrityVerifier,
  type AttestationVerifier,
} from "../domain/device/attestationVerifier.js";
import {
  DrizzleTrustedDeviceRepository,
  type TrustedDeviceRepository,
} from "../domain/device/trustedDeviceRepository.js";

export interface RegisterDeviceOverrides {
  /** Injectable for tests — bypasses the real Postgres connection entirely.
   * Production (app.ts, no override) always uses DrizzleChallengeRepository. */
  challengeRepository?: ChallengeRepository;
  /** Injectable for tests — bypasses the real Google Play Integrity network
   * call entirely. Production (app.ts, no override) always uses
   * PlayIntegrityVerifier. */
  attestationVerifier?: AttestationVerifier;
  /** Injectable for tests — bypasses the real Postgres connection entirely.
   * Production (app.ts, no override) always uses DrizzleTrustedDeviceRepository. */
  trustedDeviceRepository?: TrustedDeviceRepository;
}

/**
 * ADR-003 implementation — registers app.deviceRegistrationService, the
 * single entry point routes/devices.ts calls. Mirrors plugins/otpAuth.ts's
 * own shape exactly (same override-for-tests convention, same "production
 * always uses the real implementation" rule).
 */
export function registerDevice(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see plugins/auth.ts
  app: FastifyInstance<any, any, any, any, any>,
  overrides: RegisterDeviceOverrides = {},
): void {
  const challengeRepository = overrides.challengeRepository ?? new DrizzleChallengeRepository();
  const attestationVerifier = overrides.attestationVerifier ?? new PlayIntegrityVerifier();
  const trustedDeviceRepository =
    overrides.trustedDeviceRepository ?? new DrizzleTrustedDeviceRepository();

  app.decorate(
    "deviceRegistrationService",
    new DeviceRegistrationService(
      challengeRepository,
      attestationVerifier,
      trustedDeviceRepository,
    ),
  );
}

declare module "fastify" {
  interface FastifyInstance {
    deviceRegistrationService: DeviceRegistrationService;
  }
}
