import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
      "next/cache": fileURLToPath(new URL("./tests/stubs/next-cache.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    globals: true,
    exclude: ["tests/integration/**", "tests/e2e/**", "node_modules/**"],
    pool: "forks",
  },
});
