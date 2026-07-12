-- CreateTable
CREATE TABLE "OrgConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "OrgConfig_pkey" PRIMARY KEY ("id")
);

