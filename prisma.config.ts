import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma ORM 7 config (architecture §8.1).
 * The schema does NOT embed a connection URL. CLI/CI use `MIGRATION_DATABASE_URL`
 * (direct), while the runtime app uses the pooled `DATABASE_URL` through
 * @prisma/adapter-pg.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("MIGRATION_DATABASE_URL"),
  },
});
