-- AlterTable
ALTER TABLE "MoneyTx" ADD COLUMN     "approval" TEXT NOT NULL DEFAULT 'approved',
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "rejectReason" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "MoneyTx_approval_idx" ON "MoneyTx"("approval");
