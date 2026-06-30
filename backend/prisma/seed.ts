import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

// Prisma 7: Driver Adapter wajib untuk PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding database (RBAC 3 role)...');

  const hash = (pw: string) => bcrypt.hash(pw, 12);

  // ─── 1. Super Admin (operator platform) ─────────────────────────────────────
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@wifimanagement.local' },
    update: { role: 'SUPER_ADMIN', ownerId: null },
    create: {
      email: 'admin@wifimanagement.local',
      password: await hash('admin123'),
      name: 'Super Admin',
      role: 'SUPER_ADMIN',
      isActive: true,
    },
  });

  // ─── 2. Owner (pemilik bisnis FnB) ──────────────────────────────────────────
  const owner = await prisma.user.upsert({
    where: { email: 'owner@wifimanagement.local' },
    update: { role: 'OWNER', ownerId: null },
    create: {
      email: 'owner@wifimanagement.local',
      password: await hash('owner123'),
      name: 'Owner Demo',
      role: 'OWNER',
      isActive: true,
    },
  });

  // ─── 3. Teknisi (terikat ke Owner di atas) ──────────────────────────────────
  const teknisi = await prisma.user.upsert({
    where: { email: 'teknisi@wifimanagement.local' },
    update: { role: 'TEKNISI', ownerId: owner.id },
    create: {
      email: 'teknisi@wifimanagement.local',
      password: await hash('teknisi123'),
      name: 'Teknisi Demo',
      role: 'TEKNISI',
      ownerId: owner.id,
      isActive: true,
    },
  });

  // ─── 4. Paket Langganan (Plan) ──────────────────────────────────────────────
  const freePlan = await prisma.plan.upsert({
    where: { code: 'FREE' },
    update: { name: 'Gratis', maxRouters: 1, price: 0, durationDays: null },
    create: {
      code: 'FREE',
      name: 'Gratis',
      maxRouters: 1,
      price: 0,
      durationDays: null, // tanpa kadaluarsa
    },
  });
  await prisma.plan.upsert({
    where: { code: 'STANDARD' },
    update: { name: 'Standar', maxRouters: 5, price: 50000, durationDays: 30 },
    create: {
      code: 'STANDARD',
      name: 'Standar',
      maxRouters: 5,
      price: 50000, // Rp50.000 (placeholder, bisa diubah)
      durationDays: 30,
    },
  });

  // ─── 5. Langganan Gratis default untuk Owner demo ───────────────────────────
  const existingSub = await prisma.subscription.findFirst({
    where: { userId: owner.id },
  });
  if (!existingSub) {
    await prisma.subscription.create({
      data: {
        userId: owner.id,
        planId: freePlan.id,
        status: 'ACTIVE',
        expiredAt: null,
      },
    });
  }

  console.log('✅ Seeding selesai!');
  console.log('\n📌 Akun default (GANTI password sebelum produksi):');
  console.table([
    { role: 'SUPER_ADMIN', email: superAdmin.email, password: 'admin123' },
    { role: 'OWNER', email: owner.email, password: 'owner123' },
    {
      role: 'TEKNISI',
      email: teknisi.email,
      password: 'teknisi123',
      ownerId: teknisi.ownerId,
    },
  ]);
}

main()
  .catch((e) => {
    console.error('❌ Seeding gagal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
