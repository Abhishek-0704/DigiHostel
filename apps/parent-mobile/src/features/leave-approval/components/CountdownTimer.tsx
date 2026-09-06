import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useThemeContext } from "../../../contexts/ThemeContext";
import { deriveCountdownPresentation } from "../countdownPresentation";
import type { CountdownUrgency } from "../types";

export interface CountdownTimerProps {
  /** Authoritative expiry timestamp (ISO 8601), or `null`/`undefined` when
   * none is available — see `countdownPresentation.ts`'s doc comment: no
   * backend field currently supplies one, so this renders the honest
   * "unavailable" presentation for every real request today. */
  expiryTimestamp: string | null | undefined;
}

const URGENCY_TONE_KEY: Record<CountdownUrgency, "textSecondary" | "warning" | "error"> = {
  normal: "textSecondary",
  warning: "warning",
  critical: "error",
  expired: "textSecondary",
  unavailable: "textSecondary",
};

/**
 * Countdown presentation component (Prompt 9A). Re-derives from
 * `deriveCountdownPresentation` (pure, tested) every 30 seconds — coarse
 * enough to avoid excessive re-rendering (this is a minutes-granularity
 * label, not a stopwatch), fine enough that urgency transitions and the
 * eventual "Approval time has ended" message appear promptly. Stops
 * ticking once expired or unavailable — nothing left to count down.
 *
 * No animation is used here at all (text-only updates), so there is
 * nothing to gate behind `useReducedMotion` — this component is reduced-
 * motion-compatible by construction, not by an explicit check.
 *
 * `accessibilityLiveRegion="polite"` announces urgency/label changes
 * without interrupting the user — acceptable given updates are infrequent
 * (every 30s at most, and only when the rendered text actually changes).
 * Never mutates or claims the underlying request's authoritative state —
 * reaching zero only ever changes what THIS component displays.
 */
export function CountdownTimer({ expiryTimestamp }: CountdownTimerProps) {
  const { theme } = useThemeContext();
  const [now, setNow] = useState(() => new Date());

  const presentation = useMemo(
    () => deriveCountdownPresentation(expiryTimestamp, now),
    [expiryTimestamp, now],
  );

  // Deliberately keyed on urgency (not `now`) so the interval isn't torn
  // down/rebuilt every tick — only when the countdown crosses into a new
  // urgency tier. No react-hooks lint plugin is configured in this repo to
  // enforce exhaustive deps either way (same note as Splash's own animation
  // effect, `app/index.tsx`).
  useEffect(() => {
    if (!expiryTimestamp || presentation.urgency === "expired") return;
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, [expiryTimestamp, presentation.urgency]);

  const colorKey = URGENCY_TONE_KEY[presentation.urgency];

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.surfaceVariant, borderRadius: theme.radii.md },
      ]}
      accessibilityRole="text"
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={presentation.accessibleLabel}
    >
      <Text style={[styles.label, { color: theme.colors[colorKey] }]}>{presentation.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignSelf: "flex-start",
    minHeight: 44,
    justifyContent: "center",
  },
  label: { fontSize: 14, fontWeight: "600" },
});
