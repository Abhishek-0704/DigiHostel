import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";

/**
 * Global Fastify error handler (Prompt 0.6 audit G-01). Every route in this
 * API already maps its own known/typed domain errors to a safe response
 * BEFORE this handler ever runs (see routes/leave.ts's sendLeaveError, which
 * re-throws only for genuinely unexpected errors). This handler is the final
 * backstop for anything that reaches it — a raw database error, a bug, or a
 * Fastify-internal error (malformed JSON body, unsupported media type,
 * payload too large) — and must never forward that error's raw `.message`,
 * a stack trace, or any other internal detail to the client.
 *
 * Fastify's own framework-generated errors carry a `.statusCode` in the 4xx
 * range that FASTIFY ITSELF set — never application code. No route in this
 * API throws an error with `.statusCode` set; LeaveDomainError and its
 * subtypes are mapped to responses explicitly inside each route's own
 * try/catch (sendLeaveError), not via `.statusCode`. That means a numeric
 * 4xx `.statusCode` reaching this handler is a reliable signal that Fastify
 * itself generated a safe, generic message (e.g. "Body is not valid JSON")
 * describing something about the CLIENT's own malformed request — safe to
 * relay as-is. Anything else — no such `.statusCode`, or an explicit 5xx —
 * is unexpected and collapsed to one fixed, generic message; the real error
 * (including its stack) is logged server-side only, via pino, never sent in
 * the response body.
 */
export function createErrorHandler() {
  return async function errorHandler(
    error: FastifyError,
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const isFrameworkClientError =
      typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 500;

    if (isFrameworkClientError) {
      // Expected client-side rejection (malformed body, bad content-type,
      // etc.) — logged at `info`, not `error` (F-07): this is normal
      // traffic, not an operational incident, and must not carry the same
      // severity as an unhandled exception or a database failure below.
      request.log.info(
        { code: error.code, statusCode: error.statusCode },
        "request rejected before reaching a route handler",
      );
      await reply.code(error.statusCode!).send({
        error: { code: error.code ?? "bad_request", message: error.message, requestId: request.id },
      });
      return;
    }

    // Unexpected — a bug, a raw database error, or anything no route's own
    // typed error mapping caught. `error` severity is deliberate: this is
    // the operational-incident case Phase 6 distinguishes from the 4xx path
    // above. `requestId` in the body (F-07) lets a client-visible failure be
    // handed to an operator and looked up by the same value `request.log`
    // already stamped on every log line for this request — the response
    // never includes the error's own message or stack.
    request.log.error({ err: error }, "unhandled error");
    await reply.code(500).send({
      error: {
        code: "internal_error",
        message: "An unexpected error occurred.",
        requestId: request.id,
      },
    });
  };
}
