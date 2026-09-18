import type { ReactNode } from "react";
import styles from "./ContentContainer.module.css";

export type ContentWidth = "standard" | "wide" | "full";

export interface ContentContainerProps {
  width?: ContentWidth;
  children: ReactNode;
}

/** Reusable content-width primitive (Prompt 4 §16). `standard` suits a
 * detail/settings form; `wide` suits a dense operational table; `full`
 * removes the max-width entirely for something like an embedded map or a
 * wide analytics grid. Reception operations involve dense tables more
 * often than narrow forms, so padding stays restrained at every width
 * rather than defaulting to a spacious consumer-app feel (§16/§23). */
export function ContentContainer({ width = "standard", children }: ContentContainerProps) {
  return <div className={styles[width]}>{children}</div>;
}
