import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Reduced-motion preference (Prompt 4A). Standalone, generic — no
 * screen/feature knowledge. Any animation this app plays (Splash's
 * fade/scale, etc.) should gate itself on this rather than assuming motion
 * is always welcome.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReduced(value);
      })
      .catch(() => {
        // Platform couldn't report the current setting — keeps the safe
        // `false` default rather than crashing on an unhandled rejection.
      });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}
