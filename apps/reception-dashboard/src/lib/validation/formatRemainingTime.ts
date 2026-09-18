/** Pure `mm:ss` formatter for the inactivity warning countdown (Prompt 2
 * §28). Rounds up so the displayed count never reads "0:00" while time
 * technically remains. */
export function formatRemainingTime(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
