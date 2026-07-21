import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',

  datasource: {
    // Sengaja pakai process.env langsung (bukan helper `env()`): helper itu THROW
    // bila variabel belum ada, sehingga `prisma generate` gagal di tahap build CI
    // yang baru meng-inject DATABASE_URL saat runtime. Generate tidak butuh
    // koneksi DB; perintah yang butuh (migrate/studio) tetap error jelas di runtime.
    url: process.env.DATABASE_URL ?? '',
  },

  migrations: {
    path: 'prisma/migrations',
  },
});
