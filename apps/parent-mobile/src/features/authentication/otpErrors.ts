import type { CustomFetchError } from "@digihostel/api-client-react";
import { AppError, safeMessageFor, toAppError } from "../../types/errors";

/**
 * Maps an error thrown by `otpEligibilityService` (F-02 remediation: the
 * backend-brokered OTP request/verify calls) to this app's safe error
 * taxonomy — same convention as `features/leave-approval/leaveErrors.ts`.
 *
 * Both endpoints are deliberately anti-enumeration: a 200 from
 * POST /auth/otp/request never means "this roll number/relationship is
 * registered", and a 401 from POST /auth/otp/verify never distinguishes an
 * expired/wrong code from an unknown/exhausted/ineligible challenge — this
 * mapper must not invent a distinction the backend intentionally doesn't
 * expose.
 */
function isCustomFetchError(err: unknown): err is CustomFetchError {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number"
  );
}

export function mapOtpError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (isCustomFetchError(err)) {
    if (err.status === 401) {
      return new AppError("otp_invalid", safeMessageFor("otp_invalid"), err);
    }
    if (err.status === 429) {
      return new AppError("otp_rate_limited", safeMessageFor("otp_rate_limited"), err);
    }
    if (err.status === 400) {
      return new AppError("validation", safeMessageFor("validation"), err);
    }
    return new AppError("unknown", safeMessageFor("unknown"), err);
  }

  if (err instanceof TypeError) {
    return new AppError("network", safeMessageFor("network"), err);
  }

  return toAppError(err);
}
