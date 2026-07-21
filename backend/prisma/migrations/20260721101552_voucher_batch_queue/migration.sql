-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "voucher_batches" (
    "batchId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "usernamePrefix" TEXT,
    "charLength" INTEGER NOT NULL DEFAULT 6,
    "charFormat" TEXT NOT NULL DEFAULT 'UPPERCASE',
    "outletName" TEXT,
    "status" "BatchStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voucher_batches_pkey" PRIMARY KEY ("batchId")
);

-- CreateIndex
CREATE INDEX "voucher_batches_serverId_idx" ON "voucher_batches"("serverId");

-- CreateIndex
CREATE INDEX "voucher_batches_status_createdAt_idx" ON "voucher_batches"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "voucher_batches" ADD CONSTRAINT "voucher_batches_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "mikrotik_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_batches" ADD CONSTRAINT "voucher_batches_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "hotspot_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
