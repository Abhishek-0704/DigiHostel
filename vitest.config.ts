import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "apps/api/src/**/*.test.ts",
      "packages/*/src/**/*.test.ts",
      // Parent-mobile foundation (Prompt 2, extended Prompt 3): pure-logic
      // modules, plus a small number of gated real-Supabase integration
      // tests (*.integration.test.ts, skipped unless SUPABASE_URL/
      // SUPABASE_ANON_KEY are set) that construct their own plain
      // @supabase/supabase-js client rather than going through the app's
      // React Native/expo-secure-store-dependent services. No *.test.ts
      // file here imports React Native or Expo Router directly. Component/
      // screen testing needs jest-expo (or equivalent), a deliberately
      // not-yet-made decision — see apps/parent-mobile/docs/authentication.md.
      "apps/parent-mobile/src/**/*.test.ts",
      // Reception Dashboard foundation (Prompt 0.2): pure-logic modules.
      "apps/reception-dashboard/src/**/*.test.ts",
      // Reception Dashboard component/route tests (Prompt 3 — RBAC &
      // Authorization Framework, closing the Prompt 0.3 ASRB condition
      // "install jsdom + Testing Library before Prompt 1's UI work").
      // Each such file opts into jsdom per-file via a leading
      // `// @vitest-environment jsdom` docblock (Vitest's own supported
      // mechanism) rather than changing this config's global `environment`
      // — every existing `*.test.ts` file above keeps running under the
      // faster, unchanged `node` environment; only files that actually
      // render a component pay the jsdom cost. No `setupFiles`/jest-dom
      // was added — plain Testing Library queries plus Vitest's own
      // `expect` are sufficient for the tests added so far.
      "apps/reception-dashboard/src/**/*.test.tsx",
    ],
    environment: "node",
    // Discovered during Phase 4, Prompt 10's regression pass: several real-
    // Postgres integration test files (domain/leave, domain/movement,
    // domain/student — all pre-existing, none modified by this prompt) share
    // the same seeded fixture student (student1/TEST-S001) and each creates/
    // mutates its own "most recent leave request" for that student. Vitest
    // runs test FILES in parallel worker processes by default, so two such
    // files running at the same real time can race: whichever file's INSERT
    // lands last becomes "the most recent leave" for BOTH files' purposes,
    // breaking whichever test ran first. Reproduced directly (running
    // domain/student's + domain/movement's own integration files together,
    // unmodified, intermittently fails; the identical files run with
    // `--no-file-parallelism` pass every time) — a genuine pre-existing test-
    // isolation gap, not a defect in any single file's own logic. Disabling
    // cross-file parallelism is the minimal, correctness-preserving fix
    // (each file's Postgres-mutating tests no longer interleave with another
    // file's); the alternative — giving every integration test its own
    // dedicated, never-shared student fixture — would be a much larger,
    // out-of-scope change to established Prompt 7/8/9 test files this task
    // does not own.
    fileParallelism: false,
  },
  // `apps/reception-dashboard/vite.config.ts` inlines `__APP_VERSION__` from
  // package.json for the login footer (Prompt 2 §34) via Vite's `define` —
  // this root Vitest config runs tests directly, not through that app's own
  // Vite config, so the same constant needs its own (test-only) value here
  // or any component referencing it would throw at test time.
  define: {
    __APP_VERSION__: JSON.stringify("test"),
  },
});
