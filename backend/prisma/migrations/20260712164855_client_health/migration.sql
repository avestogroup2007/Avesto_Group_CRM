-- AlterTable
ALTER TABLE "VendorClient" ADD COLUMN     "lastCheckAt" TIMESTAMP(3),
ADD COLUMN     "lastCheckOk" BOOLEAN,
ADD COLUMN     "lastLatencyMs" INTEGER;

