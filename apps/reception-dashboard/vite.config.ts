import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Minimal, standard Vite+React config (ADR-023). No business-specific
// bundler configuration — proxying/env handling for the API base URL is
// done at the application layer (src/config/env.ts), not here, so this
// stays generic and unlikely to need per-feature edits later.
//
// `__APP_VERSION__` (Prompt 2 §34): the login footer needs a real version
// source, not a hardcoded/fabricated number. package.json's own `version`
// field is the actual, existing source of truth for this app — read once at
// build time and inlined as a compile-time constant (vite-env.d.ts declares
// its type), the standard Vite pattern for this, rather than introducing a
// runtime fetch or a duplicate copy of the version string.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8")) as {
  version: string;
};

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    sourcemap: true,
  },
});
