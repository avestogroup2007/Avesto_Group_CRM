-- CreateTable
CREATE TABLE "SupplierDebtDoc" (
    "id" TEXT NOT NULL,
    "docNumber" TEXT NOT NULL DEFAULT '',
    "docType" TEXT NOT NULL DEFAULT '',
    "supplier" TEXT NOT NULL DEFAULT '',
    "date" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remaining" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "warehouse" TEXT NOT NULL DEFAULT '',
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierDebtDoc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierDebtDoc_supplier_idx" ON "SupplierDebtDoc"("supplier");

-- CreateIndex
CREATE INDEX "SupplierDebtDoc_importedAt_idx" ON "SupplierDebtDoc"("importedAt");
