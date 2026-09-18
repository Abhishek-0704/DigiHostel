import styles from "./Skeleton.module.css";

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
}

/** Reusable loading-placeholder primitive (Prompt 0.2 §16). `aria-hidden`
 * — a skeleton is purely decorative; the real loading announcement is
 * LoadingIndicator's `role="status"`, not this. */
export function Skeleton({ width = "100%", height = 16 }: SkeletonProps) {
  return <div className={styles.skeleton} style={{ width, height }} aria-hidden="true" />;
}
