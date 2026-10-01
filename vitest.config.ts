import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Scope note (177 R3): this ONLY redirects VITE's env-file loading (loadEnv
  // reads envDir instead of the repo root) — it does not affect dotenv/config
  // imports elsewhere (tests/integration global-setup/setup, prisma.config),
  // which must be steered explicitly via DOTENV_CONFIG_PATH when sandboxing.
  // Here it keeps unit runs from crashing (EPERM on the guarded .env) and
  // from silently inheriting the developer's Vite-level env values.
  envDir: "tests/env",
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
