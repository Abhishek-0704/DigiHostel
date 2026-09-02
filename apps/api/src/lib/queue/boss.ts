import { PgBoss } from "pg-boss";
import { logger } from "../logger.js";

/**
 * pg-boss singleton (ADR-011 — Postgres-backed background jobs, no Redis),
 * following this codebase's existing convention for infrastructure
 * singletons (packages/db's `db` export, imported directly rather than
 * dependency-injected — see repository.ts).
 */
export const boss = new PgBoss({
  connectionString: process.env.DATABASE_URL ?? "",
});

boss.on("error", (err: Error) => {
  logger.error({ err }, "pg-boss: error");
});

let started = false;

export async function startQueue(): Promise<void> {
  if (started) return;
  await boss.start();
  started = true;
}

export async function stopQueue(): Promise<void> {
  if (!started) return;
  await boss.stop({ graceful: true });
  started = false;
}
