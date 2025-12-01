import { defineConfig } from "orval";

export default defineConfig({
  klassenzeit: {
    input: {
      target: "http://localhost:8080/v3/api-docs",
    },
    output: {
      mode: "tags-split",
      target: "./src/api/generated",
      schemas: "./src/api/generated/models",
      client: "react-query",
      override: {
        mutator: {
          path: "./src/api/fetcher.ts",
          name: "customFetch",
        },
        query: {
          useQuery: true,
          useMutation: true,
        },
      },
    },
    hooks: {
      afterAllFilesWrite: "npx biome check --write",
    },
  },
});
