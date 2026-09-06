import type {
  BiometricAuthenticationMethod,
  BiometricCapabilities,
} from "../../services/biometric/biometric";

/**
 * Pure capability-display helpers (Prompt 5) — no React/RN import,
 * independently unit-tested. Deliberately does not surface "strong" vs
 * "weak" biometric terminology to the user anywhere (see
 * `services/biometric/biometric.ts`'s own doc comment on why that
 * distinction is enforced internally, not explained to the user) — this
 * module only ever describes *methods* (fingerprint/face/iris), never
 * security-class internals.
 */

const METHOD_LABEL: Record<BiometricAuthenticationMethod, string> = {
  fingerprint: "Fingerprint",
  facial: "Face recognition",
  iris: "Iris recognition",
};

export function describeMethod(method: BiometricAuthenticationMethod): string {
  return METHOD_LABEL[method];
}

/** Human-joined list, e.g. "Fingerprint and Face recognition". Empty input
 * returns an empty string rather than a fabricated "biometric" label — the
 * caller decides what to show for "no methods available". */
export function describeMethods(methods: BiometricAuthenticationMethod[]): string {
  const labels = methods.map(describeMethod);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/** Whether a real authentication attempt is even worth offering — hardware
 * present AND something enrolled. Never infers enrollment from hardware
 * presence, and never infers trust/identity from either. */
export function canAuthenticate(capabilities: BiometricCapabilities): boolean {
  return capabilities.hardwareAvailable && capabilities.enrolled;
}
