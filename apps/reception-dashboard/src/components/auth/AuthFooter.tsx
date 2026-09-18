import styles from "./AuthFooter.module.css";

/**
 * Institutional footer (Prompt 2 §8/§34). The version is read from
 * package.json via `__APP_VERSION__` (vite.config.ts's `define`) — the real
 * source that exists, not a fabricated number. No dedicated support
 * channel/contact has been established anywhere in this project yet
 * (REQUIRES DECISION, not this prompt's job to invent) — the line below is
 * explicitly marked as a placeholder rather than presenting an invented KIIT
 * contact as real, per §34's explicit instruction.
 */
export function AuthFooter() {
  return (
    <footer className={styles.wrapper}>
      <p>Support contact not yet configured — placeholder. Contact your hostel administrator.</p>
      <div className={styles.row}>
        <span>&copy; {new Date().getFullYear()} KIIT Hostel Management System</span>
        <span>v{__APP_VERSION__}</span>
      </div>
    </footer>
  );
}
