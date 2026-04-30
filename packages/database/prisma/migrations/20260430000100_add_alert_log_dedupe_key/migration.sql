ALTER TABLE "alert_logs" ADD COLUMN "dedupe_key" TEXT;

CREATE UNIQUE INDEX "alert_logs_dedupe_key_key" ON "alert_logs"("dedupe_key");
