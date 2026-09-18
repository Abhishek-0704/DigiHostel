import type { ConfigurationDomain } from "@digihostel/api-client-react";

/** Human-readable labels for the real, server-owned domain allow-list
 * (`GET /configuration/domains`) — mirrors `StaffRoleLabel`'s identical
 * "labels only, never a second source of truth for which values are valid"
 * discipline. */
export const CONFIGURATION_DOMAIN_LABELS: Record<ConfigurationDomain, string> = {
  hostel: "Hostel",
  approval: "Approval",
  movement: "Movement",
  emergency: "Emergency",
  health: "Health",
  notification: "Notification",
  system: "System",
  feature_flags: "Feature Flags",
};

export function configurationDomainLabel(domain: ConfigurationDomain): string {
  return CONFIGURATION_DOMAIN_LABELS[domain] ?? domain;
}
