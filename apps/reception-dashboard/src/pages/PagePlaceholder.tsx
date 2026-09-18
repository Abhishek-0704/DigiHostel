import { ContentLayout } from "../layouts";
import { EmptyState } from "../components/ui";
import { getBreadcrumbTrail } from "../lib/navigation";

export interface PagePlaceholderProps {
  title: string;
  description: string;
  /** A `NavigationItem`/`UNGATED_NAVIGATION_ITEMS` id (Prompt 4 §12) — when
   * given, the breadcrumb trail is derived from the centralized navigation
   * model instead of being hand-written per page. Optional, so a route not
   * (yet) represented in the navigation model — none currently — still
   * renders correctly with no breadcrumb. */
  navId?: string;
  /** The final, current-page breadcrumb segment for a parameterized route
   * (e.g. a specific student's roll number) — never fetched here, always
   * supplied by the caller from its own `useParams()` (§12's "do not make
   * business API calls merely to create placeholder breadcrumbs"). */
  dynamicLabel?: string;
}

/** Shared placeholder shell (Prompt 0.2 §9/§37 — "route placeholders, not
 * implemented screens... do not create fake business data"). Every route
 * page in this scaffolding pass renders this with no business data behind
 * it — replaced feature-by-feature as each later prompt implements it. */
export function PagePlaceholder({ title, description, navId, dynamicLabel }: PagePlaceholderProps) {
  const breadcrumb = navId ? getBreadcrumbTrail(navId, dynamicLabel) : undefined;
  return (
    <ContentLayout title={title} breadcrumb={breadcrumb}>
      <EmptyState title="Not yet implemented" description={description} />
    </ContentLayout>
  );
}
