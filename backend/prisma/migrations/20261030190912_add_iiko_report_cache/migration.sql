-- CreateTable
CREATE TABLE "IikoReportCache" (
    "kind" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "periodFrom" TEXT NOT NULL,
    "periodTo" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "IikoReportCache_pkey" PRIMARY KEY ("kind","scope","periodFrom","periodTo")
);

-- CreateIndex
CREATE INDEX "IikoReportCache_expiresAt_idx" ON "IikoReportCache"("expiresAt");

-- CreateIndex
CREATE INDEX "IikoReportCache_fetchedAt_idx" ON "IikoReportCache"("fetchedAt");
