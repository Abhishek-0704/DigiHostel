import { Link } from "react-router-dom";
import styles from "./Breadcrumb.module.css";

export interface BreadcrumbSegment {
  label: string;
  to?: string;
}

export interface BreadcrumbProps {
  segments: BreadcrumbSegment[];
}

/** Content-area breadcrumb primitive (Prompt 0.2 §10/§25). `<nav
 * aria-label="Breadcrumb">` + an ordered list, matching the standard
 * accessible-breadcrumb pattern; the current page is rendered as plain
 * text with `aria-current="page"`, never a link to itself. */
export function Breadcrumb({ segments }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={styles.nav}>
      <ol className={styles.list}>
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;
          return (
            <li key={segment.label}>
              {segment.to && !isLast ? (
                <Link to={segment.to}>{segment.label}</Link>
              ) : (
                <span aria-current={isLast ? "page" : undefined}>{segment.label}</span>
              )}
              {!isLast && <span aria-hidden="true"> / </span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
