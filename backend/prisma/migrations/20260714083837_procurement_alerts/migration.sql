-- CreateTable
CREATE TABLE "ProcurementAlert" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcurementAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProcurementAlert_day_idx" ON "ProcurementAlert"("day");

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementAlert_productId_kind_day_key" ON "ProcurementAlert"("productId", "kind", "day");
