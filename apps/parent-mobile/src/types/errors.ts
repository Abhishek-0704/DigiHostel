/**
 * Application error taxonomy (Prompt 2 foundation). Mirrors the backend's
 * own typed-error / safe-message discipline (apps/api/src/domain/leave/errors.ts,
 * apps/api/src/lib/errorHandler.ts — G-01): a small set of known error kinds
 * with pre-approved, safe, user-facing messages, plus a catch-all for
 * anything unexpected that must never surface raw detail to the user.
 *
 * This file defines the taxonomy only — no feature wires it up yet.
 */

export type AppErrorKind =
  "network" | "unauthenticated" | "forbidden" | "not_found" | "conflict" | "validation" | "unknown";

export class AppError extends Error {
  constructor(
    readonly kind: AppErrorKind,
    /** Safe to show a user as-is. Never derived from a raw backend/network
     * error's own message — see toAppError() below. */
    readonly userMessage: string,
    /** The original error, kept for logging only — never rendered. */
    readonly cause?: unknown,
  ) {
    super(userMessage);
    this.name = "AppError";
  }
}

const SAFE_MESSAGES: Record<AppErrorKind, string> = {
  network: "You appear to be offline. Please check your connection and try again.",
  unauthenticated: "Your session has expired. Please sign in again.",
  forbidden: "You don't have permission to do that.",
  not_found: "We couldn't find what you were looking for.",
  conflict: "This action can no longer be completed — the item may have already changed.",
  validation: "Please check the information you entered and try again.",
  unknown: "Something went wrong. Please try again.",
};

/** Maps an arbitrary caught value (a thrown fetch error, a generated
 * client's CustomFetchError, or anything else) to an AppError with a
 * pre-approved safe message — never passes the original error's own
 * message through to the UI. Backend detail classification (mapping actual
 * HTTP status codes / `{error:{code,message}}` bodies from the generated
 * API client) belongs to the feature/service layer that knows that
 * contract, not this generic mapper — this is the fallback used when no
 * more specific classification is available. */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  return new AppError("unknown", SAFE_MESSAGES.unknown, err);
}

export function safeMessageFor(kind: AppErrorKind): string {
  return SAFE_MESSAGES[kind];
}
