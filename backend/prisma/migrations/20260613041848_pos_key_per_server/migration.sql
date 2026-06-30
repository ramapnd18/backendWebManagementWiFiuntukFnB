/*
  Warnings:

  - Added the required column `serverId` to the `pos_api_keys` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "pos_api_keys" ADD COLUMN     "serverId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "pos_api_keys_serverId_idx" ON "pos_api_keys"("serverId");

-- AddForeignKey
ALTER TABLE "pos_api_keys" ADD CONSTRAINT "pos_api_keys_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "mikrotik_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
