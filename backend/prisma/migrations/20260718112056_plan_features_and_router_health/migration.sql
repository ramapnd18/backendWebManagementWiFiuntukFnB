-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "aiAccess" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "apiKeyAccess" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxTeknisi" INTEGER NOT NULL DEFAULT 0;
-- CreateTable
CREATE TABLE "router_health_checks" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "status" "ServerStatus" NOT NULL,
    "latencyMs" INTEGER,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "router_health_checks_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "router_health_checks_serverId_checkedAt_idx" ON "router_health_checks"("serverId", "checkedAt");
-- AddForeignKey
ALTER TABLE "router_health_checks" ADD CONSTRAINT "router_health_checks_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "mikrotik_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
