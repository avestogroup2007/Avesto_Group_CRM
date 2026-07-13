-- CreateTable
CREATE TABLE "PayrollConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "PayrollConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollEntry" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bonus" BIGINT NOT NULL DEFAULT 0,
    "penalty" BIGINT NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayrollEntry_month_idx" ON "PayrollEntry"("month");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollEntry_month_userId_key" ON "PayrollEntry"("month", "userId");

