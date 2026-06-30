/*
  Warnings:

  - You are about to drop the column `adminId` on the `activity_logs` table. All the data in the column will be lost.
  - You are about to drop the column `adminId` on the `ai_reports` table. All the data in the column will be lost.
  - You are about to drop the `admins` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `ownerId` to the `mikrotik_servers` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'OWNER', 'TEKNISI');

-- DropForeignKey
ALTER TABLE "activity_logs" DROP CONSTRAINT "activity_logs_adminId_fkey";

-- DropForeignKey
ALTER TABLE "ai_reports" DROP CONSTRAINT "ai_reports_adminId_fkey";

-- DropIndex
DROP INDEX "activity_logs_adminId_idx";

-- AlterTable
ALTER TABLE "activity_logs" DROP COLUMN "adminId",
ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "ai_reports" DROP COLUMN "adminId",
ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "mikrotik_servers" ADD COLUMN     "ownerId" TEXT NOT NULL;

-- DropTable
DROP TABLE "admins";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OWNER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_ownerId_idx" ON "users"("ownerId");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "activity_logs_userId_idx" ON "activity_logs"("userId");

-- CreateIndex
CREATE INDEX "mikrotik_servers_ownerId_idx" ON "mikrotik_servers"("ownerId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mikrotik_servers" ADD CONSTRAINT "mikrotik_servers_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_reports" ADD CONSTRAINT "ai_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
