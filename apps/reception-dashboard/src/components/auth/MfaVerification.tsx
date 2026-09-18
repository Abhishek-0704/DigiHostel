import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { mfaService, isChallengeExpired } from "../../services/auth/mfaService";
import { mapAuthError } from "../../services/auth/authErrors";
import { staffAuthAuditService } from "../../services/auth/staffAuthAuditService";
import { AppError, safeMessageFor } from "../../lib/errors/errors";
import { isValidTotpCode, sanitizeTotpInput } from "../../lib/validation/authFormValidation";
import { useAuthContext } from "../../contexts/AuthContext";
import { FormField, Button, LoadingIndicator } from "../ui";
import styles from "./MfaVerification.module.css";

interface ActiveChallenge {
  factorId: string;
  challengeId: string;
  expiresAtSeconds: number;
}

/**
 * MFA/TOTP step of the login flow (Prompt 2 §9/§10). Rendered whenever
 * `AuthContext.status === "mfa_required"` — an `aal1` session already
 * exists, so this component's job is only to challenge + verify the
 * caller's already-enrolled TOTP factor via `mfaService` (Prompt 1), never a
 * custom protocol and never a self-enrollment flow (§10 — enrollment is a
 * separate, staff-provisioning-owned concern this screen does not build).
 *
 * On successful verification this does not itself flip any "authenticated"
 * flag: `mfaService.verify()` causes Supabase's SDK to emit an updated
 * session, which `AuthContext` picks up reactively (`checkAssuranceLevel`)
 * and turns into `status === "authenticated"` on its own (§13). This calls
 * `refreshAssuranceLevel()` immediately after a successful verify only as a
 * belt-and-braces nudge — `AuthContext`'s own doc comment names this exact
 * call site as its intended use, not a workaround for the reactive path
 * being unreliable (Prompt 1/3 already empirically verified it works).
 */
export function MfaVerification() {
  const { refreshAssuranceLevel, signOut } = useAuthContext();

  const [challenge, setChallenge] = useState<ActiveChallenge | null>(null);
  const [noFactorEnrolled, setNoFactorEnrolled] = useState(false);
  const [startError, setStartError] = useState<AppError | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const [code, setCode] = useState("");
  const [verifyError, setVerifyError] = useState<AppError | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  // See LoginForm.tsx's identical `isSubmittingRef` comment — a ref-based
  // guard is the actual duplicate-submission defense (§11/§19/§29);
  // `isVerifying` state remains purely for the UI.
  const isVerifyingRef = useRef(false);

  const codeRef = useRef<HTMLInputElement>(null);

  const startChallenge = useCallback(async () => {
    setIsStarting(true);
    setStartError(null);
    setNoFactorEnrolled(false);
    setVerifyError(null);
    setChallenge(null);
    setCode("");
    try {
      const factors = await mfaService.listFactors();
      const factor = factors.find((f) => f.factor_type === "totp" && f.status === "verified");
      if (!factor) {
        // Staff-provisioning boundary (§10/§37) — this account has no
        // enrolled second factor. Never silently allow through, and never
        // offer a self-service enrollment path here.
        setNoFactorEnrolled(true);
        return;
      }
      const data = await mfaService.challenge({ factorId: factor.id });
      setChallenge({
        factorId: factor.id,
        challengeId: data.id,
        expiresAtSeconds: data.expires_at,
      });
    } catch (err) {
      setStartError(mapAuthError(err));
    } finally {
      setIsStarting(false);
    }
  }, []);

  // Start a challenge as soon as this step is reached — the user already
  // completed the password step; requiring an extra click to begin MFA
  // would be friction with no security benefit.
  useEffect(() => {
    void startChallenge();
  }, [startChallenge]);

  // Focus the code field once a challenge is actually ready (§20: "After
  // password authentication requiring MFA: MFA code field").
  useEffect(() => {
    if (challenge && !isStarting) codeRef.current?.focus();
  }, [challenge, isStarting]);

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isVerifyingRef.current || !challenge) return;

    if (!isValidTotpCode(code)) {
      setVerifyError(
        new AppError(
          "mfa_verification_failed",
          "Enter the 6-digit code from your authenticator app.",
        ),
      );
      codeRef.current?.focus();
      return;
    }

    if (isChallengeExpired(challenge.expiresAtSeconds)) {
      setVerifyError(new AppError("mfa_challenge_failed", safeMessageFor("mfa_challenge_failed")));
      return;
    }

    isVerifyingRef.current = true;
    setIsVerifying(true);
    setVerifyError(null);
    try {
      await mfaService.verify({
        factorId: challenge.factorId,
        challengeId: challenge.challengeId,
        code,
      });
      await refreshAssuranceLevel();
    } catch (err) {
      const mapped = mapAuthError(err);
      setVerifyError(mapped);
      void staffAuthAuditService.record("mfa_failure");
      setCode("");
      codeRef.current?.focus();
    } finally {
      isVerifyingRef.current = false;
      setIsVerifying(false);
    }
  }

  if (noFactorEnrolled) {
    return (
      <div className={styles.wrapper}>
        <p role="alert" className={styles.formError}>
          Two-factor authentication is not set up for this account yet. Contact an administrator to
          complete setup before signing in.
        </p>
        <Button variant="secondary" onClick={() => void signOut()}>
          Back to sign in
        </Button>
      </div>
    );
  }

  if (isStarting && !challenge) {
    return <LoadingIndicator label="Preparing verification…" />;
  }

  if (startError && !challenge) {
    return (
      <div className={styles.wrapper}>
        <p role="alert" className={styles.formError}>
          {startError.userMessage}
        </p>
        <Button variant="secondary" onClick={() => void startChallenge()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <p className={styles.explanation}>
        Enter the 6-digit code from your authenticator app to finish signing in.
      </p>
      <form onSubmit={(e) => void handleVerify(e)} noValidate>
        <FormField label="Verification code" htmlFor="mfa-code" error={verifyError?.userMessage}>
          <input
            id="mfa-code"
            ref={codeRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => {
              setCode(sanitizeTotpInput(e.target.value));
              if (verifyError) setVerifyError(null);
            }}
            disabled={isVerifying}
            aria-invalid={verifyError ? true : undefined}
            aria-describedby={verifyError ? "mfa-code-error" : undefined}
            className={[styles.codeInput, verifyError ? styles.invalid : ""]
              .filter(Boolean)
              .join(" ")}
          />
        </FormField>

        <div className={styles.actions}>
          <Button type="submit" loading={isVerifying} disabled={!challenge}>
            {isVerifying ? "Verifying…" : "Verify"}
          </Button>
          <div className={styles.retryRow}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => void startChallenge()}
              disabled={isStarting || isVerifying}
            >
              Request a new code
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
