import { buildApp } from "./app.js";
import { startBackgroundWorkers } from "./workers/start.js";
import { stopQueue } from "./lib/queue/boss.js";

const port = Number(process.env.PORT ?? 8080);

const app = await buildApp();

await startBackgroundWorkers();

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

// No graceful-shutdown lifecycle existed before this task — required now so
// the escalation/notification workers (ADR-011/017/018) stop cleanly rather
// than leaving pg-boss mid-poll on process exit.
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "shutting down");
  await app.close();
  await stopQueue();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
