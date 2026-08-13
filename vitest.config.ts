import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
      "next/cache": fileURLToPath(new URL("./tests/stubs/next-cache.ts", import.meta.url)),
    },
  },
  test: {
    // Unit + component tests. Component tests opt into jsdom per-file with a
    // `// @vitest-environment jsdom` docblock. Integration tests use their own
    // config (vitest.integration.config.ts) against an isolated database.
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    environment: "node",
    globals: true,
    setupFiles: ["./tests/unit/setup.ts"],
    exclude: ["tests/integration/**", "tests/e2e/**", "node_modules/**"],
    pool: "forks",
  },
});
