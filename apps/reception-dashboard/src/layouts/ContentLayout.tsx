import type { ReactNode } from "react";
import {
  Breadcrumb,
  ContentContainer,
  type BreadcrumbSegment,
  type ContentWidth,
} from "../components/layout";
import { LoadingIndicator, ErrorState } from "../components/ui";
import styles from "./ContentLayout.module.css";

export interface ContentLayoutProps {
  title: string;
  description?: string;
  breadcrumb?: BreadcrumbSegment[];
  actions?: ReactNode;
  status?: ReactNode;
  width?: ContentWidth;
  loading?: boolean;
  loadingLabel?: string;
  error?: { message: string; onRetry?: () => void };
  children: ReactNode;
}

/**
 * Reusable page-level template (Prompt 0.2 §10, generalized into the
 * shell's page-template primitive in Prompt 4 §13/§14). This IS the
 * "Dashboard/Management/Table/Detail/Analytics/Settings/Empty/Full-Width
 * page" primitive §13 asks for — implemented as one flexible, prop-driven
 * component rather than eight near-identical wrapper components (§13's own
 * "these are layout primitives... future modules should be able to compose
 * these rather than recreate page structure," read together with §31/§42's
 * explicit "avoid over-componentization... do not create every component
 * merely because it appears in this list"). A future Dashboard/Table/
 * Detail/Settings page all differ only in `width` and what they render as
 * `children` — none of that difference warrants a separate component.
 *
 * `loading`/`error` take over the content region (breadcrumb/title/actions
 * still render, so the page's identity stays visible while its data
 * loads or fails) — every real feature page can rely on this instead of
 * hand-rolling its own loading/error switch (§13/§18/§19).
 */
export function ContentLayout({
  title,
  description,
  breadcrumb,
  actions,
  status,
  width = "standard",
  loading = false,
  loadingLabel,
  error,
  children,
}: ContentLayoutProps) {
  return (
    <div>
      {breadcrumb && breadcrumb.length > 0 && <Breadcrumb segments={breadcrumb} />}
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{title}</h1>
            {status}
          </div>
          {description && <p className={styles.description}>{description}</p>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      <ContentContainer width={width}>
        {loading ? (
          <LoadingIndicator label={loadingLabel} />
        ) : error ? (
          <ErrorState message={error.message} onRetry={error.onRetry} />
        ) : (
          children
        )}
      </ContentContainer>
    </div>
  );
}
