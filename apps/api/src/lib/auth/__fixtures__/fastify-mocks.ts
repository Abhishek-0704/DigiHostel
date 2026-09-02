import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthContext } from "../types.js";

/** Minimal mock of the FastifyReply surface guards.ts actually uses
 * (`.code().send()`), tracking what was sent for assertions — no real HTTP
 * server involved. */
export function createMockReply() {
  const state: { statusCode: number | null; body: unknown } = { statusCode: null, body: null };
  const reply = {
    code(statusCode: number) {
      state.statusCode = statusCode;
      return reply;
    },
    async send(body: unknown) {
      state.body = body;
      return reply;
    },
  } as unknown as FastifyReply;
  return { reply, state };
}

/** Minimal mock of the FastifyRequest surface guards.ts actually uses
 * (`.auth`, `.headers.authorization`, `.log`). */
export function createMockRequest(
  auth?: AuthContext,
  authorizationHeader?: string,
): FastifyRequest {
  return {
    auth,
    headers: { authorization: authorizationHeader },
    log: { info: () => {}, error: () => {}, warn: () => {} },
  } as unknown as FastifyRequest;
}
