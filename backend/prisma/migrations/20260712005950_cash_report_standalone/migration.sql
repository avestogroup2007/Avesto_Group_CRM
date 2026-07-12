-- DropForeignKey
ALTER TABLE "CashReport" DROP CONSTRAINT "CashReport_branchId_fkey";

-- AlterTable
ALTER TABLE "CashReport" ADD COLUMN     "branchName" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "CashReport_date_idx" ON "CashReport"("date");

