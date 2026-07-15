-- AlterTable
ALTER TABLE "users" ADD COLUMN     "googleId" TEXT,
ALTER COLUMN "password" DROP NOT NULL;
-- CreateIndex
CREATE INDEX "pos_transactions_profileId_idx" ON "pos_transactions"("profileId");
-- CreateIndex
CREATE INDEX "pos_transactions_voucherId_idx" ON "pos_transactions"("voucherId");
-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");
-- AddForeignKey
ALTER TABLE "pos_transactions" ADD CONSTRAINT "pos_transactions_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "mikrotik_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "pos_transactions" ADD CONSTRAINT "pos_transactions_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "hotspot_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "pos_transactions" ADD CONSTRAINT "pos_transactions_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
