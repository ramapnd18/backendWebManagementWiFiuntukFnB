-- Hapus integrasi POS (akan dibangun ulang oleh rekan tim).
-- Migrasi ini idempoten (IF EXISTS) agar aman dijalankan di DB fresh maupun
-- DB yang struktur POS-nya sudah lebih dulu di-drop via `prisma db push`.

-- DropForeignKey (relasi voucher -> pos_transactions)
ALTER TABLE "vouchers" DROP CONSTRAINT IF EXISTS "vouchers_posTransId_fkey";

-- DropColumn (kolom POS pada voucher)
ALTER TABLE "vouchers" DROP COLUMN IF EXISTS "posTransId";

-- DropTable (tabel POS)
DROP TABLE IF EXISTS "pos_transactions";

-- DropEnum (enum status POS)
DROP TYPE IF EXISTS "PosTransactionStatus";

-- Selaraskan referential action FK ke Cascade sesuai schema.prisma
-- (init lama memakai RESTRICT; ini sekaligus memperbaiki drift cascade).
ALTER TABLE "vouchers" DROP CONSTRAINT IF EXISTS "vouchers_serverId_fkey";
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "mikrotik_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vouchers" DROP CONSTRAINT IF EXISTS "vouchers_profileId_fkey";
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "hotspot_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_reports" DROP CONSTRAINT IF EXISTS "ai_reports_serverId_fkey";
ALTER TABLE "ai_reports" ADD CONSTRAINT "ai_reports_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "mikrotik_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
