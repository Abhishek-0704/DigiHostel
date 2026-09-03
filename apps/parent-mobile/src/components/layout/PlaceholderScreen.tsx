import { PageContainer } from "./PageContainer";
import { PageHeader } from "./PageHeader";
import { EmptyState } from "../feedback/EmptyState";

export interface PlaceholderScreenProps {
  title: string;
  description: string;
}

/** Used by every route placeholder created in this foundation pass
 * (Prompt 2's routing_foundation section — these are structural
 * placeholders, not feature screens). Not itself a route — each route file
 * under app/ renders this with its own title/description. */
export function PlaceholderScreen({ title, description }: PlaceholderScreenProps) {
  return (
    <PageContainer>
      <PageHeader title={title} />
      <EmptyState title="Not yet implemented" description={description} />
    </PageContainer>
  );
}
