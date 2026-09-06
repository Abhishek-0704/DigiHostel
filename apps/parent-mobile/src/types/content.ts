/**
 * Shared shape for a short title/body education section (Prompt 4B,
 * generalized in Prompt 5 for reuse beyond the devices feature). Rendered by
 * `src/components/ui/SecurityInformationCard.tsx` — kept here, not inside a
 * single feature module, specifically because more than one feature
 * (devices, biometric) now needs the exact same shape and renderer.
 */
export interface InfoSection {
  title: string;
  body: string;
}
