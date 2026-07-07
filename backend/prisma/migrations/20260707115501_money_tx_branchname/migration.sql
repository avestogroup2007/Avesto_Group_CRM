-- DropForeignKey
ALTER TABLE "MoneyTx" DROP CONSTRAINT "MoneyTx_branchId_fkey";

-- AlterTable
ALTER TABLE "MoneyTx" ADD COLUMN     "branchName" TEXT NOT NULL DEFAULT '';
