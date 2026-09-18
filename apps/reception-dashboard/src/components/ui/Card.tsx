import type { HTMLAttributes } from "react";
import styles from "./Card.module.css";

/** Reusable primitive (Prompt 0.2 §16) — a plain surface container. No
 * business content. */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={[styles.card, className].filter(Boolean).join(" ")} {...rest} />;
}
