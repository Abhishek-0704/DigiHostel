import type { CountdownPresentation, CountdownUrgency } from "./types";

/**
 * Countdown presentation logic (Prompt 9A) — no React/RN import.
 *
 * Accepts an authoritative expiry ISO timestamp (or `null`/`undefined`/an
 * unparseable value) and derives what to show — never computes or claims an
 * expiry itself. No backend field currently supplies this timestamp (see
 * `types.ts`'s doc comment on `LeaveRequestPresentation.expiryTimestamp`),
 * so `CountdownTimer` renders the `"unavailable"` presentation for every
 * real request today — this is the honest, tested, default outcome, not an
 * edge case bolted on afterward.
 *
 * Urgency thresholds (≤5min critical, ≤30min warning) are a presentation-only
 * judgment call — no ADR/SDD text specifies them, and they carry no
 * authorization meaning; changing them later is a pure UI decision.
 */
const CRITICAL_THRESHOLD_MS = 5 * 60 * 1000;
const WARNING_THRESHOLD_MS = 30 * 60 * 1000;

const UNAVAILABLE: CountdownPresentation = {
  urgency: "unavailable",
  label: "Time remaining isn't available",
  accessibleLabel: "Time remaining is not available for this request.",
};

const EXPIRED: CountdownPresentation = {
  urgency: "expired",
  label: "Approval time has ended",
  accessibleLabel: "Approval time has ended.",
};

export function deriveCountdownPresentation(
  expiryIso: string | null | undefined,
  now: Date = new Date(),
): CountdownPresentation {
  if (!expiryIso) return UNAVAILABLE;

  const expiry = new Date(expiryIso);
  if (Number.isNaN(expiry.getTime())) return UNAVAILABLE;

  const diffMs = expiry.getTime() - now.getTime();
  if (diffMs <= 0) return EXPIRED;

  const totalMinutes = Math.ceil(diffMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  const label = hours > 0 ? `${hours}h ${minutes}m remaining` : `${minutes}m remaining`;
  const accessibleLabel =
    hours > 0
      ? `${hours} hour${hours === 1 ? "" : "s"} ${minutes} minute${minutes === 1 ? "" : "s"} remaining to respond.`
      : `${minutes} minute${minutes === 1 ? "" : "s"} remaining to respond.`;

  let urgency: CountdownUrgency = "normal";
  if (diffMs <= CRITICAL_THRESHOLD_MS) urgency = "critical";
  else if (diffMs <= WARNING_THRESHOLD_MS) urgency = "warning";

  return { urgency, label, accessibleLabel };
}
