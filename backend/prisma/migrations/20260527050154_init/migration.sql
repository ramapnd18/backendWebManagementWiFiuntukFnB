-- CreateEnum
CREATE TYPE "ServerStatus" AS ENUM ('ONLINE', 'OFFLINE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "VoucherStatus" AS ENUM ('UNUSED', 'USED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PosTransactionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "AiReportStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "LogAction" AS ENUM ('ADMIN_LOGIN', 'ADMIN_LOGOUT', 'SERVER_CREATED', 'SERVER_UPDATED', 'SERVER_DELETED', 'SERVER_TESTED', 'PROFILE_CREATED', 'PROFILE_UPDATED', 'PROFILE_DELETED', 'PROFILE_SYNCED', 'VOUCHER_CREATED', 'VOUCHER_BATCH_CREATED', 'VOUCHER_PRINTED', 'VOUCHER_REVOKED', 'VOUCHER_USED', 'POS_TRANSACTION_RECEIVED', 'POS_VOUCHER_GENERATED', 'AI_ANALYSIS_STARTED', 'AI_ANALYSIS_COMPLETED', 'AI_ANALYSIS_FAILED', 'ROUTER_CONNECTION_FAILED', 'SYSTEM_ERROR');

-- CreateTable
CREATE TABLE "admins" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mikrotik_servers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 8728,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "useSSL" BOOLEAN NOT NULL DEFAULT false,
    "lastStatus" "ServerStatus" NOT NULL DEFAULT 'UNKNOWN',
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mikrotik_servers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotspot_profiles" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rateLimit" TEXT NOT NULL,
    "sessionTimeout" TEXT,
    "idleTimeout" TEXT,
    "sharedUsers" INTEGER NOT NULL DEFAULT 1,
    "validity" TEXT,
    "description" TEXT,
    "syncedToRouter" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotspot_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vouchers" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "status" "VoucherStatus" NOT NULL DEFAULT 'UNUSED',
    "batchId" TEXT,
    "posTransId" TEXT,
    "outletName" TEXT,
    "usedAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_transactions" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "customerName" TEXT,
    "voucherProfile" TEXT NOT NULL,
    "status" "PosTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_reports" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "adminId" TEXT,
    "provider" TEXT NOT NULL,
    "configJson" TEXT NOT NULL,
    "resultMd" TEXT NOT NULL,
    "status" "AiReportStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "adminId" TEXT,
    "serverId" TEXT,
    "action" "LogAction" NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "detail" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "hotspot_profiles_serverId_name_key" ON "hotspot_profiles"("serverId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_username_key" ON "vouchers"("username");

-- CreateIndex
CREATE INDEX "vouchers_serverId_idx" ON "vouchers"("serverId");

-- CreateIndex
CREATE INDEX "vouchers_profileId_idx" ON "vouchers"("profileId");

-- CreateIndex
CREATE INDEX "vouchers_status_idx" ON "vouchers"("status");

-- CreateIndex
CREATE INDEX "vouchers_batchId_idx" ON "vouchers"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "pos_transactions_transactionId_key" ON "pos_transactions"("transactionId");

-- CreateIndex
CREATE INDEX "pos_transactions_outletId_idx" ON "pos_transactions"("outletId");

-- CreateIndex
CREATE INDEX "pos_transactions_status_idx" ON "pos_transactions"("status");

-- CreateIndex
CREATE INDEX "ai_reports_serverId_idx" ON "ai_reports"("serverId");

-- CreateIndex
CREATE INDEX "activity_logs_adminId_idx" ON "activity_logs"("adminId");

-- CreateIndex
CREATE INDEX "activity_logs_serverId_idx" ON "activity_logs"("serverId");

-- CreateIndex
CREATE INDEX "activity_logs_action_idx" ON "activity_logs"("action");

-- CreateIndex
CREATE INDEX "activity_logs_createdAt_idx" ON "activity_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "hotspot_profiles" ADD CONSTRAINT "hotspot_profiles_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "mikrotik_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "mikrotik_servers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "hotspot_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_posTransId_fkey" FOREIGN KEY ("posTransId") REFERENCES "pos_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_reports" ADD CONSTRAINT "ai_reports_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "mikrotik_servers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_reports" ADD CONSTRAINT "ai_reports_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "mikrotik_servers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
