/** Presentation-only formatting helpers for the Analytics Dashboard (Phase
 * 6, Prompt 15) — never alters the underlying server-computed value, only
 * its display text. */

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

export function formatPercent(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`;
}
