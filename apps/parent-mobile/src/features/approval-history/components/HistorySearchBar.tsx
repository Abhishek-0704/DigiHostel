import { TextField } from "../../../components/ui/TextField";

export interface HistorySearchBarProps {
  value: string;
  onChangeText: (value: string) => void;
}

/** Thin, fully-controlled wrapper around the existing `TextField` primitive
 * (Phase 4 Prompt 10) — debouncing is the calling screen's responsibility
 * (via the existing `useDebounce` hook), so this component stays a plain
 * controlled input, matching `TextField`'s own established convention. */
export function HistorySearchBar({ value, onChangeText }: HistorySearchBarProps) {
  return (
    <TextField
      placeholder="Search by reason or status"
      value={value}
      onChangeText={onChangeText}
      accessibilityLabel="Search approval history"
      returnKeyType="search"
      autoCorrect={false}
    />
  );
}
