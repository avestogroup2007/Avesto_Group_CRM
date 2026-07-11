-- AlterTable
ALTER TABLE "User" ADD COLUMN     "telegramId" TEXT;

-- CreateTable
CREATE TABLE "ShiftChecklistRun" (
    "id" TEXT NOT NULL,
    "branchId" TEXT,
    "kind" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "slot" TEXT,
    "items" JSONB NOT NULL,
    "pct" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT,
    "via" TEXT NOT NULL DEFAULT 'bot',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftChecklistRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotSession" (
    "telegramId" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotSession_pkey" PRIMARY KEY ("telegramId")
);

-- CreateIndex
CREATE INDEX "ShiftChecklistRun_branchId_date_idx" ON "ShiftChecklistRun"("branchId", "date");

-- CreateIndex
CREATE INDEX "ShiftChecklistRun_kind_date_idx" ON "ShiftChecklistRun"("kind", "date");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

