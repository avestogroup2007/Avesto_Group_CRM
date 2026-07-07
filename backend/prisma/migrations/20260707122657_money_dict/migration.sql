-- AlterTable
ALTER TABLE "MoneyTx" ADD COLUMN     "account" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "ddsArticle" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "legalEntity" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "MoneyDict" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoneyDict_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MoneyDict_type_idx" ON "MoneyDict"("type");

-- CreateIndex
CREATE UNIQUE INDEX "MoneyDict_type_name_key" ON "MoneyDict"("type", "name");
