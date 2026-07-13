-- CreateTable
CREATE TABLE "TodoTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'todo',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "assigneeId" TEXT,
    "branchId" TEXT,
    "dueDate" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "TodoTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TodoTask_status_idx" ON "TodoTask"("status");

-- CreateIndex
CREATE INDEX "TodoTask_assigneeId_idx" ON "TodoTask"("assigneeId");

-- CreateIndex
CREATE INDEX "TodoTask_branchId_idx" ON "TodoTask"("branchId");

-- CreateIndex
CREATE INDEX "TodoTask_createdById_idx" ON "TodoTask"("createdById");

-- CreateIndex
CREATE INDEX "TodoTask_dueDate_idx" ON "TodoTask"("dueDate");

