import { Expo } from "expo-server-sdk";
import type { PushSendResult, PushSender } from "../../domain/notification/types.js";

/**
 * Real Expo Push (ADR-010) implementation of the PushSender port. A resolved
 * ticket is either 'ok' (accepted for delivery — Case "accepted", ADR-018
 * §5) or an explicit error (Case "rejected" — e.g. an invalid/expired
 * token, §6, handled as an ordinary delivery failure, not a device-trust
 * event). A thrown error (network failure, timeout) is Case "unknown" —
 * outcome genuinely undetermined, resolved identically to a failure per
 * ADR-018 §5 (retry, bounded by the same policy).
 */
export class ExpoPushSender implements PushSender {
  private readonly client = new Expo(
    process.env.EXPO_ACCESS_TOKEN ? { accessToken: process.env.EXPO_ACCESS_TOKEN } : undefined,
  );

  async send(tokens: string[], title: string, body: string): Promise<PushSendResult> {
    const validTokens = tokens.filter((token) => Expo.isExpoPushToken(token));
    if (validTokens.length === 0) {
      // No currently-trusted device has a push token yet (e.g. the
      // parent-mobile device-registration flow — a different workstream —
      // hasn't run for this recipient). Treated as an ordinary rejection,
      // not a crash: nothing to retry toward without a token.
      return { outcome: "rejected", reason: "no_valid_push_token" };
    }

    try {
      const tickets = await this.client.sendPushNotificationsAsync(
        validTokens.map((to) => ({ to, title, body })),
      );
      // Successful if the provider accepts for at least one currently-
      // trusted device (ADR-018 §7 — fan-out is one delivery attempt).
      const accepted = tickets.some((ticket) => ticket.status === "ok");
      if (accepted) {
        return { outcome: "accepted" };
      }
      const firstError = tickets.find((ticket) => ticket.status === "error");
      return {
        outcome: "rejected",
        reason: firstError && "message" in firstError ? firstError.message : "provider_rejected",
      };
    } catch {
      return { outcome: "unknown" };
    }
  }
}
