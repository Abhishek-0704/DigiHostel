import styles from "./Footer.module.css";

/** Minimal shell footer landmark (Prompt 4 §6/§27 — the layout hierarchy's
 * `<footer>` landmark). Deliberately compact — an enterprise operations
 * screen prioritizes content density over a decorative footer (§23); this
 * exists for the landmark and the real, non-fabricated version string
 * (the same `__APP_VERSION__` build-time constant the login footer already
 * uses, Prompt 2 §34 — not a second, invented number). */
export function Footer() {
  return (
    <footer className={styles.footer}>
      <span>&copy; {new Date().getFullYear()} KIIT Hostel Management System</span>
      <span>v{__APP_VERSION__}</span>
    </footer>
  );
}
