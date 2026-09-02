// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.expo/**",
      "**/*.generated.ts",
      "packages/api-zod/src/generated/**",
      "packages/api-client-react/src/generated/**",
    ],
  },
  {
    // Plain Node scripts (not part of any tsconfig project) — TS files get
    // Node globals from @types/node; typescript-eslint's recommended config
    // already disables no-undef for .ts files in favor of tsc itself, but
    // plain .mjs scripts have neither, so declare the Node globals they
    // actually use explicitly rather than pulling in the `globals` package
    // for one small script.
    files: ["**/scripts/**/*.mjs"],
    languageOptions: {
      globals: { process: "readonly", console: "readonly" },
    },
  },
);
