-- CreateTable
CREATE TABLE "PlanEntry" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "revenue" BIGINT NOT NULL DEFAULT 0,
    "expense" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanEntry_month_idx" ON "PlanEntry"("month");

-- CreateIndex
CREATE UNIQUE INDEX "PlanEntry_month_branchId_key" ON "PlanEntry"("month", "branchId");

