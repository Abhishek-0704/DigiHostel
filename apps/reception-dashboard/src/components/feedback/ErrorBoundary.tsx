import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "../ui/ErrorState";
import { logger } from "../../lib/logging/logger";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/** Recovery boundary (Prompt 0.2 §20 — "React error boundaries where
 * appropriate"). Wraps the whole app in main.tsx so an unexpected render
 * error degrades to a safe, generic message instead of a blank white
 * screen. Never renders the raw error's own message to the user (matches
 * lib/errors/errors.ts's "never expose sensitive backend details" rule) —
 * only logs it. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error("Unhandled render error", { error: error.message, stack: info.componentStack });
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorState
          message="Something went wrong. Please reload the page."
          onRetry={() => window.location.reload()}
        />
      );
    }
    return this.props.children;
  }
}
