-- AlterTable
ALTER TABLE "User" ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "fireDate" TEXT,
ADD COLUMN     "hireDate" TEXT,
ADD COLUMN     "iikoDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "iikoDepartment" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "iikoId" TEXT,
ADD COLUMN     "login" TEXT,
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "positionCode" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'manual';

-- CreateIndex
CREATE UNIQUE INDEX "User_iikoId_key" ON "User"("iikoId");

