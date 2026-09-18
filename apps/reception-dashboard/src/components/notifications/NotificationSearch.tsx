import { SearchInput } from "../ui";

export interface NotificationSearchProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Reusable notification search box (Prompt 6 §18). Reuses the existing
 * `SearchInput` primitive (Prompt 0.2) rather than a duplicate. No
 * debounce: every current notification dataset is local/in-memory
 * (`notificationService.list()` always resolves synchronously to a small
 * array), so there is no actual asynchronous search boundary to debounce
 * against yet — see `features/notifications/filtering.ts`'s doc comment
 * for the documented future server-side search boundary this would need
 * once real, larger datasets exist.
 */
export function NotificationSearch({ value, onChange }: NotificationSearchProps) {
  return (
    <SearchInput
      label="Search notifications"
      placeholder="Search by title, message, or source"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
