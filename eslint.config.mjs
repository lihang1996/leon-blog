import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Flat ESLint config (eslint-config-next v16 ships flat configs natively —
 * FlatCompat legacy conversion is not needed).
 */
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    "node_modules/**",
    ".next/**",
    "out/**",
    "src/generated/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "*.config.*",
    "prisma/**",
  ]),
  // Layer boundary: modules/lib must not depend back on the app layer.
  {
    files: ["src/modules/**/*.ts", "src/lib/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [{ group: ["@/app/*"], message: "modules/lib must not import from the app layer" }],
        },
      ],
    },
  },
  // Layer boundary: app/components must not touch Prisma directly (use services).
  {
    files: ["src/app/**/*.ts", "src/app/**/*.tsx", "src/components/**/*.ts", "src/components/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/generated/*"], message: "app/components must not import Prisma; use modules/services" },
            { group: ["@prisma/client", "@prisma/adapter-pg", "pg"], message: "app/components must not import DB directly" },
          ],
        },
      ],
    },
  },
  // Domain policy files must stay framework-free (pure functions).
  {
    files: ["**/*-policy.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["next/*", "next"], message: "policy files must not depend on Next.js" },
            { group: ["@prisma/*", "@/generated/*", "pg"], message: "policy files must not depend on Prisma/DB" },
          ],
        },
      ],
    },
  },
]);
