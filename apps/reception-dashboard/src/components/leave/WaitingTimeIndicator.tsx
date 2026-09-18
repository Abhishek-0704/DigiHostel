import { useCurrentDateTime } from "../../hooks";
import { computeWaitingMinutes, formatWaitingDuration } from "../../features/leave";

export interface WaitingTimeIndicatorProps {
  createdAt: string;
}

/** Real, live-updating elapsed-time indicator (Prompt 7A §12/§27). Reuses
 * the existing `useCurrentDateTime` tick (Prompt 4/5's header clock/live
 * status source) rather than opening a second timer — this component
 * simply reads the shared "now" and recomputes a pure function of it. */
export function WaitingTimeIndicator({ createdAt }: WaitingTimeIndicatorProps) {
  const now = useCurrentDateTime();
  const minutes = computeWaitingMinutes(createdAt, now);
  return <span title={new Date(createdAt).toLocaleString()}>{formatWaitingDuration(minutes)}</span>;
}
