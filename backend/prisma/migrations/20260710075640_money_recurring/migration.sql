-- CreateTable
CREATE TABLE "MoneyRecurring" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'expense',
    "category" TEXT NOT NULL,
    "ddsArticle" TEXT NOT NULL DEFAULT '',
    "paymentType" TEXT NOT NULL DEFAULT 'Наличные',
    "legalEntity" TEXT NOT NULL DEFAULT '',
    "account" TEXT NOT NULL DEFAULT '',
    "counterparty" TEXT NOT NULL DEFAULT '',
    "comment" TEXT NOT NULL DEFAULT '',
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "branchId" TEXT,
    "branchName" TEXT NOT NULL DEFAULT '',
    "dayOfMonth" INTEGER NOT NULL DEFAULT 1,
    "startMonth" TEXT NOT NULL,
    "endMonth" TEXT NOT NULL DEFAULT '',
    "autoApprove" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastPostedMonth" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoneyRecurring_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MoneyRecurring_active_idx" ON "MoneyRecurring"("active");
