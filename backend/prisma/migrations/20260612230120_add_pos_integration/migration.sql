-- CreateEnum
CREATE TYPE "PosTxStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "pos_api_keys" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_transactions" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "posApiKeyId" TEXT,
    "serverId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "voucherId" TEXT,
    "status" "PosTxStatus" NOT NULL DEFAULT 'SUCCESS',
    "errorMessage" TEXT,
    "outletName" TEXT,
    "customerName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pos_api_keys_keyHash_key" ON "pos_api_keys"("keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "pos_transactions_transactionId_key" ON "pos_transactions"("transactionId");

-- CreateIndex
CREATE INDEX "pos_transactions_serverId_idx" ON "pos_transactions"("serverId");

-- AddForeignKey
ALTER TABLE "pos_transactions" ADD CONSTRAINT "pos_transactions_posApiKeyId_fkey" FOREIGN KEY ("posApiKeyId") REFERENCES "pos_api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;
