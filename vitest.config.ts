import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "apps/api/src/**/*.test.ts",
      "packages/*/src/**/*.test.ts",
      // Parent-mobile foundation (Prompt 2): pure-logic modules only — no
      // React Native/Expo Router import anywhere in a *.test.ts file here.
      // Component/screen testing needs jest-expo (or equivalent), a
      // deliberately not-yet-made decision — see
      // apps/parent-mobile/docs/testing.md.
      "apps/parent-mobile/src/**/*.test.ts",
    ],
    environment: "node",
  },
});
