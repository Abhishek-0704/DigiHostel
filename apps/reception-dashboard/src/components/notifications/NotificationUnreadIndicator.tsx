import styles from "./NotificationUnreadIndicator.module.css";

/** A visual dot plus a screen-reader-only "Unread" label (Prompt 6 §34 —
 * "accessible unread state," never color/shape alone with no text
 * equivalent). The dot itself is `aria-hidden` (purely decorative); the
 * "Unread" text is a SEPARATE, real (not nested inside the hidden dot)
 * visually-hidden element so assistive tech actually announces it. Renders
 * nothing for a read notification — callers should only mount this when
 * the notification is genuinely unread. */
export function NotificationUnreadIndicator() {
  return (
    <>
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.srOnly}>Unread</span>
    </>
  );
}
