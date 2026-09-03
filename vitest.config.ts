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
    ],
    environment: "node",
  },
});
