import styles from "./SkipLink.module.css";

export interface SkipLinkProps {
  targetId: string;
}

/** Standard "skip to main content" link (Prompt 4 §27 — keyboard/landmark
 * accessibility). Visually hidden until focused, so it doesn't affect
 * sighted layout but is the very first Tab stop for a keyboard user,
 * letting them bypass the sidebar/header on every page load without
 * penalty. */
export function SkipLink({ targetId }: SkipLinkProps) {
  return (
    <a href={`#${targetId}`} className={styles.link}>
      Skip to main content
    </a>
  );
}
