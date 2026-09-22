-- Optimistic concurrency token for article content/state writes.
ALTER TABLE "posts" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "login_throttles" (
    "key_hash" VARCHAR(64) NOT NULL,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "window_started_at" TIMESTAMPTZ(3) NOT NULL,
    "blocked_until" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "login_throttles_pkey" PRIMARY KEY ("key_hash")
);
