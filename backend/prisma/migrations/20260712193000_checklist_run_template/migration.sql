-- AlterTable
ALTER TABLE "ShiftChecklistRun" ADD COLUMN     "position" TEXT,
ADD COLUMN     "templateId" TEXT,
ADD COLUMN     "title" TEXT;

-- CreateIndex
CREATE INDEX "ShiftChecklistRun_templateId_date_idx" ON "ShiftChecklistRun"("templateId", "date");

