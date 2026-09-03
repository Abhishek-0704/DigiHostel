import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { Loader } from "@/src/components/feedback/Loader";
import { ErrorState } from "@/src/components/feedback/ErrorState";
import { useAuth } from "@/src/hooks/useAuth";
import { useTheme } from "@/src/hooks/useTheme";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { AppError } from "@/src/types/errors";
import { splashStatusMessage } from "@/src/features/authentication/statusMessages";

/**
 * Splash screen (Prompt 2 scaffold; wired to real auth state in Prompt 3;
 * polished in Prompt 4A). AuthGate (src/navigation/AuthGate.tsx) owns the
 * actual redirect once status resolves — this screen only presents that
 * already-derived state; it never decides it. No session-restoration logic
 * is duplicated here.
 */
export default function Splash() {
  const { status, error } = useAuth();
  const { theme } = useTheme();
  const reducedMotion = useReducedMotion();

  const opacity = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const scale = useRef(new Animated.Value(reducedMotion ? 1 : 0.94)).current;

  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(1);
      scale.setValue(1);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
    // Intentionally runs once on mount (no react-hooks lint plugin is
    // configured in this repo to enforce exhaustive deps either way) —
    // reducedMotion changing mid-splash (a rare edge case) just skips
    // future animation, doesn't replay this one.
  }, []);

  if (status === "error" || status === "offline") {
    return (
      <PageContainer style={styles.center}>
        <ErrorState
          error={
            error ??
            new AppError(
              status === "offline" ? "network" : "unknown",
              status === "offline"
                ? "You appear to be offline. Please check your connection and try again."
                : "Something went wrong. Please try again.",
            )
          }
        />
      </PageContainer>
    );
  }

  const message = splashStatusMessage(status);

  return (
    <PageContainer style={styles.center}>
      <Animated.View style={{ opacity, transform: [{ scale }], alignItems: "center" }}>
        <Text
          style={[styles.wordmark, { color: theme.colors.textPrimary }]}
          accessibilityRole="header"
        >
          DigiHostel
        </Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>Parent</Text>
      </Animated.View>
      <Loader />
      {message ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[
            styles.status,
            { color: theme.colors.textSecondary, marginTop: theme.spacing.lg },
          ]}
        >
          {message}
        </Text>
      ) : null}
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  wordmark: { fontSize: 28, fontWeight: "700", letterSpacing: 0.2 },
  subtitle: { fontSize: 15, fontWeight: "500", marginTop: 2 },
  status: { fontSize: 13, textAlign: "center" },
});
