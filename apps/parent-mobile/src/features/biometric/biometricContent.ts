import type { InfoSection } from "../../types/content";

/**
 * Static biometric education copy (Prompt 5) — shown on the Biometric
 * Settings screen (`app/(app)/security/biometric.tsx`) before enabling.
 * Mirrors `features/devices/deviceContent.ts`'s pattern: plain language,
 * no cryptographic terminology, no claim this app can't back up.
 *
 * Deliberately never claims: "Your fingerprint is stored securely by
 * DigiHostel," "DigiHostel verified your fingerprint," or "your face was
 * verified by our server" — see docs/authentication.md §16's security-UX
 * rules. The device operating system performs the check; this app only
 * observes its result. Verified by `biometricContent.test.ts`.
 */
export const BIOMETRIC_INFO_SECTIONS: InfoSection[] = [
  {
    title: "How does this work?",
    body: "Your device's own fingerprint or face unlock confirms it's you. DigiHostel never sees your fingerprint or face — only a yes/no result from your device.",
  },
  {
    title: "What is stored?",
    body: "Only whether you've chosen to turn this on for this device. Nothing about your fingerprint or face is ever stored by this app.",
  },
  {
    title: "What is not stored?",
    body: "Your fingerprint, face data, and device passcode are never seen, stored, or transmitted by DigiHostel — they never leave your device's own security hardware.",
  },
  {
    title: "When is this used?",
    body: "Before sensitive actions, like approving a leave request or removing a trusted device, to help confirm it's really you.",
  },
  {
    title: "What if it doesn't work?",
    body: "You can always use your device passcode instead, or turn this off in Settings at any time.",
  },
];
