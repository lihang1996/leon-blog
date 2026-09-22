ALTER TABLE "categories" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tags" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "login_throttles_updated_at_idx" ON "login_throttles"("updated_at");
