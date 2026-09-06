/**
 * Pure registration/replacement UI-state helpers (Prompt 4B) — mirrors
 * `features/authentication/statusMessages.ts`'s pattern. Deliberately only
 * three states: this app's `registerCurrentDevice()` is a single call that
 * either resolves or rejects — there is no real multi-stage backend
 * verification process to represent (no polling, no webhook, no staged
 * attestation callback exists today), so no artificial "verifying" substep
 * is invented beyond the one real in-flight request.
 */

export type RegistrationUiState = "idle" | "registering" | "failed";

/** Text for an `accessibilityLiveRegion="polite"` announcement — empty
 * string means "nothing to announce", not "loading" (avoid announcing an
 * empty string). */
export function registrationStatusMessage(state: RegistrationUiState): string {
  switch (state) {
    case "registering":
      return "Verifying your device…";
    case "idle":
    case "failed":
      return "";
  }
}
