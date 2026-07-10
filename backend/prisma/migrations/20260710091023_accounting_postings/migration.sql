-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'active',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostingRule" (
    "id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "debit" TEXT NOT NULL DEFAULT '',
    "credit" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Posting" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "number" TEXT NOT NULL DEFAULT '',
    "debit" TEXT NOT NULL,
    "credit" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "description" TEXT NOT NULL DEFAULT '',
    "legalEntity" TEXT NOT NULL DEFAULT '',
    "branchId" TEXT,
    "branchName" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "refId" TEXT,
    "moneyTxId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Posting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_code_key" ON "LedgerAccount"("code");

-- CreateIndex
CREATE INDEX "LedgerAccount_code_idx" ON "LedgerAccount"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PostingRule_direction_category_key" ON "PostingRule"("direction", "category");

-- CreateIndex
CREATE UNIQUE INDEX "Posting_refId_key" ON "Posting"("refId");

-- CreateIndex
CREATE INDEX "Posting_date_idx" ON "Posting"("date");

-- CreateIndex
CREATE INDEX "Posting_debit_idx" ON "Posting"("debit");

-- CreateIndex
CREATE INDEX "Posting_credit_idx" ON "Posting"("credit");
