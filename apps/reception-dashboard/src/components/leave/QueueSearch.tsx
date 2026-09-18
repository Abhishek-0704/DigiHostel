import { SearchInput } from "../ui";

export interface QueueSearchProps {
  value: string;
  onChange: (value: string) => void;
}

/** Reusable queue search box (Prompt 7A §15) — thin `SearchInput` wrapper,
 * mirroring `NotificationSearch`'s established pattern. No debounce: the
 * queue dataset is fetched once per page/refresh and filtered/searched
 * entirely client-side (see `features/leave/filtering.ts`'s doc comment for
 * the documented tradeoff), so there is no asynchronous search boundary to
 * debounce against. */
export function QueueSearch({ value, onChange }: QueueSearchProps) {
  return (
    <SearchInput
      label="Search leave requests"
      placeholder="Search by student, roll number, hostel, or room"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
