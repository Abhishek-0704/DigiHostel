import { Component, type ErrorInfo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { logger } from "../../services/logger/logger";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Root-level error boundary (Prompt 2 foundation). Deliberately does NOT
 * depend on ThemeContext/design tokens — this is the last line of defense
 * if something above it (including a provider) throws during render, so it
 * uses static, hardcoded neutral styling rather than risk depending on
 * something that could itself be the cause of the crash.
 *
 * Never renders the caught error's message or stack — only a fixed, safe
 * fallback, matching this app's error-handling discipline everywhere else
 * (src/types/errors.ts, apps/api's G-01 sanitization). The real error is
 * logged via the logger abstraction only.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error("Unhandled render error caught by ErrorBoundary", {
      message: error.message,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container} accessibilityRole="alert">
          <Text style={styles.message}>Something went wrong. Please restart the app.</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  message: { fontSize: 15, textAlign: "center", color: "#171A21" },
});
