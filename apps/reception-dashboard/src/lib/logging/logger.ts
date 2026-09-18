/**
 * Logging abstraction (Prompt 0.2 foundation). A thin wrapper over `console`
 * today — its value is the single choke point every future feature logs
 * through, so swapping in a real observability SDK later is a one-file
 * change, not a repo-wide find-and-replace. No such SDK is installed in
 * this pass — not justified by any current requirement. Mirrors
 * apps/parent-mobile/src/services/logger/logger.ts, with `__DEV__` (an
 * Expo/RN global) replaced by Vite's own `import.meta.env.DEV`.
 *
 * Never log: tokens, session contents, biometric assertions, or any raw
 * backend error detail beyond what the backend itself already exposes
 * (matching apps/api's own "never log the JWT" discipline —
 * apps/api/src/lib/auth/guards.ts).
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  const payload = context ? [message, context] : [message];
  switch (level) {
    case "debug":
      if (import.meta.env.DEV) console.debug(...payload);
      break;
    case "info":
      console.info(...payload);
      break;
    case "warn":
      console.warn(...payload);
      break;
    case "error":
      console.error(...payload);
      break;
  }
}

export const logger: Logger = {
  debug: (message, context) => log("debug", message, context),
  info: (message, context) => log("info", message, context),
  warn: (message, context) => log("warn", message, context),
  error: (message, context) => log("error", message, context),
};
