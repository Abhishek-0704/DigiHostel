import type { CustomFetchError } from "@digihostel/api-client-react";
import { AppError, safeMessageFor, toAppError } from "../../types/errors";

/**
 * Maps an error thrown by `approvalService` (Prompt 9B: real HTTP calls
 * through the generated client) to this app's safe error taxonomy — mirrors
 * `features/devices/deviceErrors.ts`'s `mapDeviceError` pattern: classify by
 * type/status/code, never by pattern-matching a raw message onto the user.
 *
 * The generated client's `customFetch` mutator
 * (packages/api-client-react/src/custom-fetch.ts) throws a
 * `CustomFetchError` (`{status, message}`) for any non-2xx response, where
 * `message` is the raw response TEXT — for this backend, a JSON string of
 * `{error:{code,message,currentStatus?}}` (apps/api/src/routes/leave.ts's
 * `sendLeaveError`, apps/api/src/lib/errorHandler.ts's global fallback). A
 * genuine network-level failure (device offline, DNS failure, timeout
 * before any response) throws a plain `TypeError`/`Error` instead — no
 * `status` field at all — classified below as `"network"`, never as
 * `"unknown"` (the caller needs to distinguish "definitely did not happen"
 * from "outcome uncertain, must reconcile" — see
 * `leaveDecisionReconciliation.ts`).
 */

interface BackendErrorBody {
  error?: { code?: string; message?: string; currentStatus?: string };
}

function isCustomFetchError(err: unknown): err is CustomFetchError {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number"
  );
}

function parseBackendCode(message: string): string | undefined {
  try {
    const body = JSON.parse(message) as BackendErrorBody;
    return body.error?.code;
  } catch {
    // Not JSON (e.g. a plain-text 5xx from an intermediary/proxy) — no code
    // to extract, fall back to status-only classification below.
    return undefined;
  }
}

export function mapLeaveApprovalError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (isCustomFetchError(err)) {
    const code = parseBackendCode(err.message);

    if (err.status === 401) {
      return new AppError("unauthenticated", safeMessageFor("unauthenticated"), err);
    }
    if (err.status === 403) {
      if (code === "device_revoked") {
        return new AppError("device_revoked", safeMessageFor("device_revoked"), err);
      }
      if (code === "biometric_confirmation_required") {
        return new AppError(
          "biometric_verification_failed",
          safeMessageFor("biometric_verification_failed"),
          err,
        );
      }
      return new AppError("forbidden", safeMessageFor("forbidden"), err);
    }
    if (err.status === 404) {
      return new AppError("not_found", safeMessageFor("not_found"), err);
    }
    if (err.status === 409) {
      return new AppError("conflict", safeMessageFor("conflict"), err);
    }
    if (err.status === 400) {
      return new AppError("validation", safeMessageFor("validation"), err);
    }
    return new AppError("unknown", safeMessageFor("unknown"), err);
  }

  // No `status` field at all — the request never reached/returned from the
  // backend (offline, DNS failure, timeout, aborted). Genuinely uncertain
  // whether the mutation applied — never assume "unknown"/no-op here.
  if (err instanceof TypeError) {
    return new AppError("network", safeMessageFor("network"), err);
  }

  return toAppError(err);
}
