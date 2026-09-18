import { useEffect, useRef, useState, type FormEvent } from "react";
import { authService } from "../../services/auth/authService";
import { AppError, toAppError } from "../../lib/errors/errors";
import {
  validateCredentials,
  type CredentialsFieldErrors,
} from "../../lib/validation/authFormValidation";
import { FormField, PasswordInput, Button } from "../ui";
import styles from "./LoginForm.module.css";

export interface LoginFormProps {
  /** Rendered above the fields when the user just landed here after a
   * sign-out/session-loss (Prompt 2 §16/§33) — this component itself has no
   * opinion on session history, it only reserves the slot. */
  notice?: string;
}

/**
 * Password step of the login flow (Prompt 2 §8/§11/§13). Presentation +
 * validation + submission only — the actual authentication call is
 * `authService.signIn` (Prompt 1), never a direct Supabase call from this
 * component (§3). On success this deliberately does nothing beyond clearing
 * the password field: `AuthContext`'s `status` reactively becomes
 * `"mfa_required"` once the resulting `aal1` session is observed
 * (`SessionContext`'s `onAuthStateChange` subscription), and `LoginPage`
 * re-renders to the MFA step from that — never a manually-set
 * `authenticated = true` (§13's explicit rule).
 */
export function LoginForm({ notice }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<CredentialsFieldErrors>({});
  const [formError, setFormError] = useState<AppError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  // A React state check (`isSubmitting`) alone isn't a reliable
  // re-entrancy guard: it only reflects reality once a render has
  // committed, and a form can legitimately receive more than one "submit"
  // event before that happens (e.g. Enter held down, or a disabled button
  // that a synthetic/automated click can still target). A ref is read and
  // written synchronously, independent of render timing, so it's the actual
  // duplicate-submission guard (§11/§19/§29); `isSubmitting` state remains
  // purely for the UI (disabling inputs, showing the spinner label).
  const isSubmittingRef = useRef(false);

  // Initial focus (§20: "Initial login: Email").
  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  function clearErrorsOnEdit() {
    if (formError) setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmittingRef.current) return; // duplicate-submission guard (§11/§19)

    const errors = validateCredentials(email, password);
    setFieldErrors(errors);
    if (errors.email || errors.password) {
      // Focus the first invalid field (§20).
      (errors.email ? emailRef : passwordRef).current?.focus();
      return;
    }

    setFormError(null);
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      await authService.signIn(email.trim(), password);
      // Never preserve a password beyond what's needed for the attempt
      // (§33) — cleared on success; the resulting MFA/dashboard step never
      // needs it again.
      setPassword("");
    } catch (err) {
      const mapped = err instanceof AppError ? err : toAppError(err);
      setFormError(mapped);
      // Recover focus so keyboard users aren't stranded on a disabled
      // button after a failed attempt (§20/§33).
      passwordRef.current?.focus();
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} noValidate>
      {notice && <p className={styles.notice}>{notice}</p>}

      <FormField label="Email" htmlFor="login-email" error={fieldErrors.email}>
        <input
          id="login-email"
          ref={emailRef}
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }));
            clearErrorsOnEdit();
          }}
          disabled={isSubmitting}
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
          className={[styles.textInput, fieldErrors.email ? styles.invalid : ""]
            .filter(Boolean)
            .join(" ")}
        />
      </FormField>

      <FormField label="Password" htmlFor="login-password" error={fieldErrors.password}>
        <PasswordInput
          id="login-password"
          ref={passwordRef}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }));
            clearErrorsOnEdit();
          }}
          disabled={isSubmitting}
          invalid={Boolean(fieldErrors.password)}
          aria-invalid={fieldErrors.password ? true : undefined}
          aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
        />
      </FormField>

      {formError && (
        <div role="alert" className={styles.formError}>
          {formError.userMessage}
        </div>
      )}

      <Button type="submit" loading={isSubmitting} className={styles.submit}>
        {isSubmitting ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
