import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createChannel, removeChannel } from "../services/supabase/realtime";

/**
 * Notification realtime subscription (Prompt 8) — reuses the existing
 * generic `createChannel`/`removeChannel` wrapper
 * (`src/services/supabase/realtime.ts`, Prompt 2) rather than a new realtime
 * abstraction, per this prompt's explicit instructions.
 *
 * ADR-009 accepts Postgres Changes for `notifications`. This subscribes to
 * `*` events on the `notifications` table with NO client-side filter — RLS
 * (enabled on that table, `notifications_select_own_parent`/`_own_student`)
 * scopes which change events this client actually receives; there is no
 * reliable client-side way to know this app's own `parents.id` to filter by
 * (it is resolved server-side via a SECURITY DEFINER lookup, not equal to
 * the Supabase Auth user id — `packages/db/src/schema/rls-helpers.ts`), so
 * relying on RLS instead of a client-supplied filter is both simpler and
 * correct. One subscription for the whole notification collection, per this
 * prompt's "avoid unnecessary subscriptions" instruction — never one
 * subscription per notification.
 *
 * On any change, this simply invalidates/refetches the notification list via
 * the caller-supplied `onChange` rather than attempting to merge a partial
 * payload into the cache — the safest, simplest reconciliation strategy for
 * a first implementation.
 *
 * IMPORTANT CAPABILITY NOTE: no migration in this repository adds
 * `notifications` to a realtime publication
 * (`supabase/migrations/*.sql` — no `PUBLICATION` statement exists anywhere).
 * This subscription is real and ADR-009-correct, but per the
 * `<backend_capability_rule>` this prompt sets, adding that publication is
 * identified backend/database work, not implemented here — see
 * `docs/notifications.md`'s capability matrix. This channel will connect
 * successfully but will not necessarily receive change events until that
 * migration lands; `useNotificationCenter`'s pull-to-refresh remains the
 * reliable way to see new notifications regardless.
 */
export type NotificationRealtimeStatus =
  "connecting" | "connected" | "disconnected" | "unavailable";

export function useNotificationRealtime(onChange: () => void): NotificationRealtimeStatus {
  const [status, setStatus] = useState<NotificationRealtimeStatus>("connecting");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // Tracks whether this channel has already reached "connected" once, so a
  // later SUBSCRIBED transition (a reconnect after a drop) can be told apart
  // from the very first connect.
  const hasConnectedOnceRef = useRef(false);

  useEffect(() => {
    let channel: RealtimeChannel;
    try {
      channel = createChannel("parent-mobile:notifications");
    } catch {
      // Supabase not configured (e.g. missing env) — an ordinary, already
      // fail-soft condition elsewhere in this app (SessionContext's own
      // configError handling), not a crash here either.
      setStatus("unavailable");
      return;
    }

    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
        onChangeRef.current();
      })
      .subscribe((subscribeStatus) => {
        if (subscribeStatus === "SUBSCRIBED") {
          // Postgres Changes never replays events missed while disconnected
          // — a reconnect (as opposed to the very first connect, whose data
          // the mount's own initial fetch already covers) must trigger a
          // real catch-up refetch, or a change that happened during the drop
          // would go unreflected until an unrelated remount/manual refresh.
          if (hasConnectedOnceRef.current) {
            onChangeRef.current();
          }
          hasConnectedOnceRef.current = true;
          setStatus("connected");
        } else if (subscribeStatus === "CHANNEL_ERROR" || subscribeStatus === "TIMED_OUT") {
          setStatus("unavailable");
        } else if (subscribeStatus === "CLOSED") setStatus("disconnected");
      });

    return () => {
      removeChannel(channel);
    };
  }, []);

  return status;
}
