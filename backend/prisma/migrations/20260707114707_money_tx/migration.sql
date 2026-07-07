-- CreateTable
CREATE TABLE "MoneyTx" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "paymentType" TEXT NOT NULL DEFAULT 'Наличные',
    "counterparty" TEXT NOT NULL DEFAULT '',
    "comment" TEXT NOT NULL DEFAULT '',
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "amountUzs" BIGINT NOT NULL,
    "branchId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "refId" TEXT,
    "iikoStatus" TEXT NOT NULL DEFAULT 'none',
    "iikoDocId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoneyTx_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MoneyTx_refId_key" ON "MoneyTx"("refId");

-- CreateIndex
CREATE INDEX "MoneyTx_date_idx" ON "MoneyTx"("date");

-- CreateIndex
CREATE INDEX "MoneyTx_direction_idx" ON "MoneyTx"("direction");

-- CreateIndex
CREATE INDEX "MoneyTx_branchId_idx" ON "MoneyTx"("branchId");

-- CreateIndex
CREATE INDEX "MoneyTx_category_idx" ON "MoneyTx"("category");

-- AddForeignKey
ALTER TABLE "MoneyTx" ADD CONSTRAINT "MoneyTx_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
