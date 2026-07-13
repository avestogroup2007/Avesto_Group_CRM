-- CreateTable
CREATE TABLE "ApprovalConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "ApprovalConfig_pkey" PRIMARY KEY ("id")
);

