#!/usr/bin/env node
// Proves that a compiled consumer (apps/api) can resolve internal workspace
// packages through their DECLARED package interface (main/exports/types)
// under a plain Node runtime — no tsx, no ts-node, no loader, no NODE_PATH
// hack. Deliberately a plain .mjs script run with `node`, not a vitest test:
// vitest's vite-node transform pipeline can execute .ts source directly,
// which would silently mask exactly the regression this script exists to
// catch (someone reverting a package's "main"/"exports"/"types" back to an
// unbuilt "./src/index.ts" path). Plain Node cannot execute .ts at all, so
// if that regression happens, this script fails loudly with a real
// resolution/execution error instead of passing by accident.
//
// See docs/workspace-build-and-runtime.md for the full design this checks.

/** @type {{ name: string, requiredExports: string[] }[]} */
const packagesToVerify = [
  { name: "@digihostel/db", requiredExports: ["db", "students", "parents", "staff"] },
];

let failed = false;

for (const pkg of packagesToVerify) {
  console.log(`Verifying runtime resolution: ${pkg.name}`);

  let resolvedUrl;
  try {
    resolvedUrl = await import.meta.resolve(pkg.name);
  } catch (err) {
    console.error(`  FAIL: could not resolve "${pkg.name}" at all: ${err.message}`);
    failed = true;
    continue;
  }

  if (!resolvedUrl.endsWith(".js")) {
    console.error(
      `  FAIL: "${pkg.name}" resolved to "${resolvedUrl}", which is not a .js file. ` +
        `A production Node runtime cannot execute TypeScript source directly — ` +
        `check this package's "main"/"exports" fields point at built dist/ output.`,
    );
    failed = true;
    continue;
  }
  if (!resolvedUrl.includes("/dist/")) {
    console.error(
      `  FAIL: "${pkg.name}" resolved to "${resolvedUrl}", which is not under a dist/ ` +
        `directory. Expected compiled output, not raw source.`,
    );
    failed = true;
    continue;
  }

  let mod;
  try {
    mod = await import(pkg.name);
  } catch (err) {
    console.error(
      `  FAIL: resolved "${pkg.name}" to ${resolvedUrl} but importing it threw: ${err.message}`,
    );
    failed = true;
    continue;
  }

  for (const exportName of pkg.requiredExports) {
    if (!(exportName in mod)) {
      console.error(`  FAIL: "${pkg.name}" is missing expected export "${exportName}"`);
      failed = true;
    }
  }

  if (!failed) {
    console.log(`  OK: resolved to ${resolvedUrl}, all expected exports present`);
  }
}

if (failed) {
  console.error("\nWorkspace package runtime-resolution verification FAILED.");
  process.exit(1);
}

console.log("\nWorkspace package runtime-resolution verification passed.");
