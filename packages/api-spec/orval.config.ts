import { defineConfig } from "orval";

export default defineConfig({
  "api-zod": {
    input: "./openapi.yaml",
    output: {
      mode: "single",
      target: "../api-zod/src/generated/api.ts",
      client: "zod",
    },
  },
  "api-client-react": {
    input: "./openapi.yaml",
    output: {
      mode: "single",
      target: "../api-client-react/src/generated/api.ts",
      client: "react-query",
      override: {
        mutator: {
          path: "../api-client-react/src/custom-fetch.ts",
          name: "customFetch",
        },
      },
    },
  },
});
