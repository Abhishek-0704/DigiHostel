/**
 * Pure "protection summary" derivation (Prompt 6) — no React/RN import,
 * independently unit-tested. Deliberately NOT a numeric security score: no
 * accepted ADR/SDD text defines a score calculation, and this prompt's own
 * instructions forbid fabricating one. A qualitative label + tone +
 * explanatory sentence is the honest alternative this module produces
 * instead — never an absolute claim like "Your account is completely
 * secure," always a precise, qualified statement of what was actually
 * checked (see `securityStatus.test.ts`'s explicit assertions against
 * exactly those unsupported phrasings).
 */

export type ProtectionTone = "success" | "neutral" | "warning";

export interface ProtectionSummary {
  label: string;
  tone: ProtectionTone;
  description: string;
}

export interface ProtectionSummaryInput {
  /** Derived from the same real, RLS-scoped device list the Security
   * Center already fetched — never a separate, redundant check. */
  hasActiveTrustedDevice: boolean;
  biometricEnabled: boolean;
}

export function deriveProtectionSummary(input: ProtectionSummaryInput): ProtectionSummary {
  if (!input.hasActiveTrustedDevice) {
    return {
      label: "Attention needed",
      tone: "warning",
      description: "This device isn't verified as trusted yet.",
    };
  }
  if (input.biometricEnabled) {
    return {
      label: "Protection checks in place",
      tone: "success",
      description: "This device is trusted, and biometric authentication is enabled.",
    };
  }
  return {
    label: "Basic protection active",
    tone: "neutral",
    description:
      "This device is trusted. Enable biometric authentication for an extra layer of protection.",
  };
}
