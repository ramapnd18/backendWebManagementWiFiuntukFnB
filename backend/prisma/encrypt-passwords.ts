/**
 * Skrip migrasi data: enkripsi password router MikroTik yang masih plaintext.
 * Idempoten — baris yang sudah terenkripsi dilewati.
 *
 * Jalankan: npx ts-node prisma/encrypt-passwords.ts
 *
 * Logika kripto di-inline (duplikat ringan dari src/common/crypto.util.ts) agar
 * skrip ops ini berdiri sendiri tanpa masalah resolusi modul ESM/.js di ts-node.
 */
import 'dotenv/config';
import * as crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const PREFIX = 'enc:v1:';
const ALGO = 'aes-256-gcm';

function getKey(): Buffer {
  const raw = process.env.MIKROTIK_ENC_KEY;
  if (!raw) throw new Error('MIKROTIK_ENC_KEY belum diset di environment.');
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  return crypto.createHash('sha256').update(raw).digest();
}

function isEncrypted(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.startsWith(PREFIX);
}

function encryptSecret(plain: string): string {
  if (!plain || isEncrypted(plain)) return plain ?? '';
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return (
    PREFIX +
    [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':')
  );
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const servers = await prisma.mikrotikServer.findMany();
  let encrypted = 0;
  let skipped = 0;

  for (const s of servers) {
    if (isEncrypted(s.password)) {
      skipped++;
      continue;
    }
    await prisma.mikrotikServer.update({
      where: { id: s.id },
      data: { password: encryptSecret(s.password) },
    });
    encrypted++;
    console.log(`  ✓ Encrypted: ${s.name} (${s.host})`);
  }

  console.log(`\nSelesai. Terenkripsi: ${encrypted}, dilewati: ${skipped}`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
