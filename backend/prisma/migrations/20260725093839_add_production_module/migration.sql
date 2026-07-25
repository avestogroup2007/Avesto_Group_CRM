-- CreateTable
CREATE TABLE "ProductionDepartment" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "telegramTopic" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ProductionDepartment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhaseWarehouseMap" (
    "id" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "category" TEXT,
    "warehouseId" TEXT NOT NULL,
    "warehouseName" TEXT NOT NULL DEFAULT '',
    "departmentId" TEXT NOT NULL,

    CONSTRAINT "PhaseWarehouseMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionTask" (
    "id" TEXT NOT NULL,
    "nodeCode" TEXT NOT NULL,
    "nodeName" TEXT NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'SEMI',
    "planQty" DECIMAL(18,4) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '',
    "deliveryDate" TIMESTAMP(3) NOT NULL,
    "shift" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "warehouseId" TEXT NOT NULL DEFAULT '',
    "batchId" TEXT NOT NULL,
    "orderRef" TEXT,
    "parentTaskId" TEXT,
    "departmentId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionFact" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "qty" DECIMAL(18,4) NOT NULL,
    "reportedById" TEXT NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correctionOf" TEXT,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ProductionFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedDocument" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "factId" TEXT,
    "iikoDocId" TEXT NOT NULL DEFAULT '',
    "docType" TEXT NOT NULL,
    "warehouseFrom" TEXT NOT NULL DEFAULT '',
    "warehouseTo" TEXT NOT NULL DEFAULT '',
    "productCode" TEXT NOT NULL DEFAULT '',
    "productName" TEXT NOT NULL DEFAULT '',
    "qty" DECIMAL(18,4) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "error" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductionDepartment_code_key" ON "ProductionDepartment"("code");

-- CreateIndex
CREATE INDEX "PhaseWarehouseMap_departmentId_idx" ON "PhaseWarehouseMap"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "PhaseWarehouseMap_phase_category_key" ON "PhaseWarehouseMap"("phase", "category");

-- CreateIndex
CREATE INDEX "ProductionTask_status_idx" ON "ProductionTask"("status");

-- CreateIndex
CREATE INDEX "ProductionTask_departmentId_status_idx" ON "ProductionTask"("departmentId", "status");

-- CreateIndex
CREATE INDEX "ProductionTask_batchId_idx" ON "ProductionTask"("batchId");

-- CreateIndex
CREATE INDEX "ProductionTask_nodeCode_idx" ON "ProductionTask"("nodeCode");

-- CreateIndex
CREATE INDEX "ProductionTask_deliveryDate_idx" ON "ProductionTask"("deliveryDate");

-- CreateIndex
CREATE INDEX "ProductionFact_taskId_idx" ON "ProductionFact"("taskId");

-- CreateIndex
CREATE INDEX "ProductionFact_correctionOf_idx" ON "ProductionFact"("correctionOf");

-- CreateIndex
CREATE INDEX "GeneratedDocument_taskId_idx" ON "GeneratedDocument"("taskId");

-- CreateIndex
CREATE INDEX "GeneratedDocument_factId_idx" ON "GeneratedDocument"("factId");

-- CreateIndex
CREATE INDEX "GeneratedDocument_docType_idx" ON "GeneratedDocument"("docType");

-- AddForeignKey
ALTER TABLE "PhaseWarehouseMap" ADD CONSTRAINT "PhaseWarehouseMap_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "ProductionDepartment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionTask" ADD CONSTRAINT "ProductionTask_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "ProductionTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionTask" ADD CONSTRAINT "ProductionTask_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "ProductionDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionFact" ADD CONSTRAINT "ProductionFact_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ProductionTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ProductionTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
