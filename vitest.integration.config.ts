import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // See vitest.config.ts — this redirects ONLY Vite's env-file loading away
  // from the repo root (loadEnv EPERM-crashes on the guarded real .env).
  // The dotenv/config imports in tests/integration and prisma.config.ts are
  // NOT covered by envDir: run them with an explicit DOTENV_CONFIG_PATH
  // pointing at a scratch fixture when an isolated environment is required.
  envDir: "tests/env",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
      "next/cache": fileURLToPath(new URL("./tests/stubs/next-cache.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    globals: true,
    globalSetup: ["./tests/integration/global-setup.ts"],
    setupFiles: ["./tests/integration/setup.ts"],
    pool: "forks",
    hookTimeout: 120_000,
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
