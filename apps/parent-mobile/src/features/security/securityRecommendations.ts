import type { TrustedDeviceSummary } from "../../services/devices/devices";
import { getDeviceTrustState } from "../devices/deviceStatus";

/**
 * Pure, rule-based recommendation derivation (Prompt 6) — no React/RN
 * import, independently unit-tested. Every recommendation here is derived
 * from state this app already has authoritatively (the real device list,
 * the real local biometric capability/preference) — nothing implies a
 * backend check that doesn't exist. This is intentionally a small, honest
 * rule set, not a "recommendation engine" — see this module's own
 * `deriveSecurityRecommendations` for the exact, auditable conditions.
 *
 * Structured so a future backend-driven recommendation (e.g. "a linked
 * parent's device was recently added") could be merged into the same
 * `Recommendation[]` shape without a UI redesign — `RecommendationCard`
 * only ever needs `{title, description, actionLabel, actionTarget}`; where
 * a given recommendation's condition is evaluated does not affect how it's
 * rendered.
 */

export type RecommendationActionTarget = "biometric-settings" | "devices-list" | "security-tips";

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  actionTarget: RecommendationActionTarget;
}

export interface RecommendationInput {
  biometricCapable: boolean;
  biometricEnabled: boolean;
  devices: TrustedDeviceSummary[];
}

export function deriveSecurityRecommendations(input: RecommendationInput): Recommendation[] {
  const recommendations: Recommendation[] = [];

  if (input.biometricCapable && !input.biometricEnabled) {
    recommendations.push({
      id: "enable-biometric",
      title: "Enable biometric authentication",
      description:
        "Add an extra layer of protection using this device's fingerprint or face unlock.",
      actionLabel: "Turn on",
      actionTarget: "biometric-settings",
    });
  }

  const activeDevices = input.devices.filter((device) => getDeviceTrustState(device) === "active");
  const revokedDevices = input.devices.filter(
    (device) => getDeviceTrustState(device) === "revoked",
  );

  if (activeDevices.length === 0) {
    recommendations.push({
      id: "verify-a-device",
      title: "Verify a trusted device",
      description: "Verify this device to help protect your account and approve leave requests.",
      actionLabel: "Learn more",
      actionTarget: "security-tips",
    });
  }

  if (revokedDevices.length > 0) {
    recommendations.push({
      id: "review-device-history",
      title: "Review your trusted devices",
      description:
        revokedDevices.length === 1
          ? "You have 1 removed device on record. Review your device list periodically."
          : `You have ${revokedDevices.length} removed devices on record. Review your device list periodically.`,
      actionLabel: "Review devices",
      actionTarget: "devices-list",
    });
  }

  return recommendations;
}
