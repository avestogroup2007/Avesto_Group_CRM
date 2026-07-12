-- CreateTable
CREATE TABLE "ModuleConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "ModuleConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTemplate" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "position" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "scheduleType" TEXT NOT NULL DEFAULT 'daily',
    "fromHour" INTEGER,
    "toHour" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChecklistTemplate_kind_idx" ON "ChecklistTemplate"("kind");

-- CreateIndex
CREATE INDEX "ChecklistTemplate_active_idx" ON "ChecklistTemplate"("active");

