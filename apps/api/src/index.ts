import { closeDb } from "@digihostel/db";
import { buildApp } from "./app.js";
import { startBackgroundWorkers } from "./workers/start.js";
import { stopQueue } from "./lib/queue/boss.js";
import { logger } from "./lib/logger.js";

const port = Number(process.env.PORT ?? 8080);

// F-06 production hardening — an unrecoverable startup failure (e.g. the
// database is unreachable, SUPABASE_URL is missing) must exit loudly with a
// structured log line, not a raw stack dump to stderr and/or a process that
// hangs half-initialized. Node's own default top-level-await-rejection
// behavior already exits non-zero, but bypasses `logger` (pino) entirely,
// which would leave a production host's log aggregation with an unparsed
// stack trace instead of a queryable structured event — the one thing this
// try/catch exists to fix.
try {
  // buildSha is already in every log line via logger.ts's own `base` (F-07)
  // — not repeated here, to avoid a duplicate key in the structured output.
  logger.info({ port }, "startup: beginning");

  const app = await buildApp();

  await startBackgroundWorkers();
  logger.info("startup: background workers registered");

  await app.listen({ port, host: "0.0.0.0" });
  logger.info({ port }, "startup: complete, accepting requests");

  // Ordering here is deliberate, not incidental (F-06 Phase 5): Fastify and
  // pg-boss are stopped before the shared Postgres connection pool, so
  // neither is left mid-operation against a closed connection; pg-boss's
  // own `stop({ graceful: true })` already waits for in-flight jobs rather
  // than abandoning them (ADR-011/ADR-018).
  let shuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "shutdown: beginning");

    // Safety net: if something hangs (a stuck DB call, a pg-boss job that
    // never settles), force-exit rather than leaving an orphaned process a
    // host's process supervisor has to notice and kill itself. Chosen well
    // above pg-boss's own default job-completion grace period so a normal
    // shutdown never races it.
    const forceExitTimer = setTimeout(() => {
      logger.error({ signal }, "shutdown: did not complete in time, forcing exit");
      process.exit(1);
    }, 30_000);
    forceExitTimer.unref();

    try {
      await app.close();
      logger.info("shutdown: Fastify closed");
      await stopQueue();
      logger.info("shutdown: pg-boss stopped");
      await closeDb();
      logger.info("shutdown: database connections closed");
      clearTimeout(forceExitTimer);
      logger.info({ signal }, "shutdown: complete");
      process.exit(0);
    } catch (err) {
      logger.error({ err, signal }, "shutdown: error while shutting down");
      clearTimeout(forceExitTimer);
      process.exit(1);
    }
  }
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
} catch (err) {
  logger.error({ err }, "startup: failed, exiting");
  process.exit(1);
}
