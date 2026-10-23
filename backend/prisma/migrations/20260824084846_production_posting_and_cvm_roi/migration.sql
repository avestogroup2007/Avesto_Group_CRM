-- AlterTable
ALTER TABLE "CvmCampaign" ADD COLUMN     "cost" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "GeneratedDocument" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "iikoResponse" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "payload" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "postedAt" TIMESTAMP(3),
ALTER COLUMN "status" SET DEFAULT 'pending';

-- CreateTable
CREATE TABLE "CvmCampaignMember" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "control" BOOLEAN NOT NULL DEFAULT false,
    "ordersAtSend" INTEGER NOT NULL DEFAULT 0,
    "spentAtSend" BIGINT NOT NULL DEFAULT 0,
    "lastOrderAtSend" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CvmCampaignMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "ProductionConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CvmCampaignMember_campaignId_control_idx" ON "CvmCampaignMember"("campaignId", "control");

-- CreateIndex
CREATE INDEX "CvmCampaignMember_customerId_idx" ON "CvmCampaignMember"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CvmCampaignMember_campaignId_customerId_key" ON "CvmCampaignMember"("campaignId", "customerId");

-- CreateIndex
CREATE INDEX "GeneratedDocument_status_idx" ON "GeneratedDocument"("status");

-- AddForeignKey
ALTER TABLE "CvmCampaignMember" ADD CONSTRAINT "CvmCampaignMember_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CvmCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ранее созданные документы имели status='created' в значении «записан в CRM,
-- в iiko не отправлен». Приводим к новому явному значению 'pending', чтобы
-- журнал и повторная отправка работали единообразно.
UPDATE "GeneratedDocument" SET "status" = 'pending' WHERE "status" = 'created';
