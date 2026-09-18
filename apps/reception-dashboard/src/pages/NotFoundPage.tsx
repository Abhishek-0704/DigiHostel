import { useNavigate } from "react-router-dom";
import { ContentLayout } from "../layouts";
import { EmptyState, Button } from "../components/ui";
import { ROUTES } from "../constants/routes";

/**
 * Not Found (Prompt 4 §20) — distinct from Forbidden (`AccessDeniedMessage`,
 * authenticated but lacking permission) and from Unauthorized (no
 * authenticated session at all, handled by `RequireAuth`'s redirect to
 * `/login` — an existing, unchanged mechanism, not duplicated here per
 * §33/§5). This is specifically "no route/resource matches," the router's
 * own catch-all (`routes/index.tsx`'s `path: "*"`). Reveals nothing about
 * whether a resource with this identifier might exist elsewhere — the
 * message is the same regardless of what was typed.
 */
export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <ContentLayout title="Page not found">
      <EmptyState
        title="We couldn't find that page"
        description="The page you're looking for doesn't exist or may have moved."
        action={
          <Button onClick={() => void navigate(ROUTES.dashboard)}>Return to Dashboard</Button>
        }
      />
    </ContentLayout>
  );
}
