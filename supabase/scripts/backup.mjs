#!/usr/bin/env node
// F-04 remediation (PRR Phase 13) — minimal, safe logical-backup wrapper
// around Supabase's own documented `supabase db dump` (see
// docs/runbooks/disaster-recovery.md for the full recovery procedure this
// output feeds into).
//
// Deliberately thin: this script does not embed, read, or print any
// credential itself — `supabase db dump --linked` uses whatever project the
// Supabase CLI is already linked to (`supabase link`) and its own stored
// access token; `--local` uses the local dev stack's fixed local
// credentials. Output is written under supabase/backups/, which
// supabase/.gitignore excludes entirely — a database dump must never be
// committed.
//
// Usage:
//   node supabase/scripts/backup.mjs local     # dump the local dev stack
//   node supabase/scripts/backup.mjs linked    # dump the CLI's linked project
//
// "linked" requires `supabase link --project-ref <ref>` to have already been
// run for the intended project — this script never accepts or constructs a
// project reference/connection string itself, so it can never be pointed at
// the wrong project by a stray argument.

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const target = process.argv[2];
if (target !== "local" && target !== "linked") {
  console.error("Usage: node supabase/scripts/backup.mjs <local|linked>");
  process.exit(1);
}

const targetFlag = target === "local" ? "--local" : "--linked";
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = join(process.cwd(), "supabase", "backups", `${target}-${timestamp}`);
mkdirSync(outDir, { recursive: true });

const schemaFile = join(outDir, "schema.sql");
const dataFile = join(outDir, "data.sql");

// Windows resolves `npx` to a .cmd shim, which node:child_process cannot
// spawn without a shell (a Node/Windows platform limitation, not something
// this script can avoid). Every argument passed through the shell below is
// either a fixed literal or this script's own computed timestamped file
// path — never argv/user/environment-sourced content — so the shell-args
// escaping risk Node's spawnSync docs warn about does not apply here.
const useShell = process.platform === "win32";

function runDump(label, extraArgs, file) {
  console.log(`Dumping ${label} (${target}) -> ${file}`);
  const result = spawnSync(
    "npx",
    ["supabase", "db", "dump", targetFlag, "-f", file, ...extraArgs],
    { stdio: "inherit", shell: useShell },
  );
  if (result.status !== 0) {
    console.error(`FAILED: ${label} dump (exit code ${result.status})`);
    process.exit(result.status ?? 1);
  }
}

runDump("schema", [], schemaFile);
runDump("data", ["--data-only"], dataFile);

console.log(`\nBackup complete: ${outDir}`);
console.log(
  "Reminder: this directory is git-ignored (supabase/.gitignore) — never commit it, " +
    "copy it into a tracked path, or paste its contents anywhere outside a controlled, " +
    "access-restricted storage location.",
);
