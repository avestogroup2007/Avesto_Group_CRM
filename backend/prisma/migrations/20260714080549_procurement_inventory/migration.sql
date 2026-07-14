-- CreateTable
CREATE TABLE "PurchaseEntry" (
    "id" TEXT NOT NULL,
    "iikoDocId" TEXT NOT NULL,
    "docNumber" TEXT NOT NULL DEFAULT '',
    "date" TIMESTAMP(3) NOT NULL,
    "supplier" TEXT NOT NULL DEFAULT '',
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL DEFAULT '',
    "unit" TEXT NOT NULL DEFAULT '',
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sum" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "storeId" TEXT NOT NULL DEFAULT '',
    "storeName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductStockRule" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "minQty" DOUBLE PRECISION,
    "maxQty" DOUBLE PRECISION,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductStockRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "ProcurementConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseEntry_iikoDocId_idx" ON "PurchaseEntry"("iikoDocId");

-- CreateIndex
CREATE INDEX "PurchaseEntry_productId_date_idx" ON "PurchaseEntry"("productId", "date");

-- CreateIndex
CREATE INDEX "PurchaseEntry_date_idx" ON "PurchaseEntry"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ProductStockRule_productId_key" ON "ProductStockRule"("productId");
