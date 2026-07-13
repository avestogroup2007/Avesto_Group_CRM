-- CreateTable
CREATE TABLE "FoodCostConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "FoodCostConfig_pkey" PRIMARY KEY ("id")
);

