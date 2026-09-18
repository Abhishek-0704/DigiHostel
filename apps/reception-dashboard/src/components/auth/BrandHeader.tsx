import styles from "./BrandHeader.module.css";

/**
 * Institutional branding block for the login/MFA card (Prompt 2 §8/§23).
 * Restrained, text-only — no illustration, no gradient, no logo asset exists
 * in this repository to reference, so none is fabricated here. The security
 * notice below states only what this application actually does (staff
 * authentication events ARE genuinely recorded — `apps/api/src/domain/auth/
 * staffAuthAudit.ts`, Prompt 1) — never an unverified claim.
 */
export function BrandHeader() {
  return (
    <div className={styles.wrapper}>
      <span className={styles.institution}>KIIT Hostel Management System</span>
      <h1 className={styles.title}>Reception Dashboard</h1>
      <p className={styles.welcome}>Sign in with your staff account to continue.</p>
      <p className={styles.notice}>
        Authorized hostel staff only. Sign-in and verification activity on this system is recorded.
      </p>
    </div>
  );
}
