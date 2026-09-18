import type { ActivityItemData, FuturePanelState } from "./types";

/**
 * Recent Activity data source (Prompt 5 §11). `AuditService.ts` is
 * interface-only (`audit_logs` has zero client-facing RLS by design — a
 * dedicated staff-role-gated Fastify endpoint is required and does not
 * exist yet, Phase 5/Prompt 12 per `docs/current-state.md`); the same is
 * true of every other candidate event source (leave decisions, movement,
 * emergency/health alerts) for the reasons `operationalSummary.ts` and
 * `usePendingWork.ts` already document. Genuinely nothing to show yet.
 *
 * A real hook, not an inline empty state, so a future prompt only has to
 * supply real events here — `ActivityFeed` already renders whatever
 * `items` it receives, newest first.
 */
export function useActivityFeed(): FuturePanelState<ActivityItemData> {
  return { availability: "future", items: [] };
}
