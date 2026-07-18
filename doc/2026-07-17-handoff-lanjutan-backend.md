# Handoff — Lanjutan Kerja Backend (mulai sesi baru)

**Tanggal dibuat:** 2026-07-17 · **Peran:** Backend (NestJS 11 + Prisma 7, ESM).
**Tujuan dokumen:** biar sesi berikutnya bisa langsung lanjut tanpa mengulang konteks.

---

## 1. Yang SUDAH selesai (state terkini)

Semua sudah **di-commit & di-push ke repo backend-only** (`backend` remote, tip `3ec4060`). Ringkas commit terakhir:

| Commit | Isi |
|--------|-----|
| `e0589d1` | **Fitur baru**: registrasi Owner (`POST /auth/register`) + login Google (`POST /auth/google`), voucher stats (`GET /vouchers/stats`), riwayat POS (`GET /pos/transactions`), split activity-log ↔ router-connections. + migrasi `google_auth_and_pos_tx_relations` (User.password nullable + googleId; relasi server/profile/voucher pada PosTransaction). |
| `3a60d81` | **Dokumentasi API lengkap** semua modul di `doc/api/` + hasil uji runtime nyata (router CHR). Fix bug **500** `POST /ai/servers/:id/analyze` saat body kosong. |
| `b7e89a7` | Rapikan & konsolidasi `doc/` (BACKEND.md pusat, api/, frontend/, archive/). |
| `523b30d` | Handoff FE: `doc/frontend/HANDOFF-backend-20260716.md`. |

**Dokumentasi acuan:** [`doc/BACKEND.md`](./BACKEND.md) (pusat) · [`doc/api/`](./api/) (kontrak + hasil uji per modul) · [`doc/spec/`](./spec/) (PRD/SRS/SDD/Arsitektur) · [`doc/todo_backendp.md`](./todo_backendp.md).

---

## 2. Yang HARUS dikerjakan berikutnya

**Sumber kebenaran = [`doc/2026-07-17-peta-endpoint-backend-untuk-frontend.md`](./2026-07-17-peta-endpoint-backend-untuk-frontend.md)** (permintaan dari tim Frontend). Baca penuh sebelum mulai. Ringkasan:

### Perubahan schema
- **`Plan`** tambah field: `maxTeknisi Int`, `aiAccess Boolean @default(false)`, `apiKeyAccess Boolean @default(false)`.
- **Model baru `RouterHealthCheck`** (serverId, status, latencyMs?, checkedAt) + **scheduler** cek periodik (±60 dtk) yang mencatat **setiap** hasil cek (OK & gagal) + kebijakan **retensi** (prune 30–90 hari).

### Endpoint baru 🆕
| Endpoint | Untuk | Role |
|----------|-------|------|
| `GET /admin/owners` | Tabel Kelola Owner + agregat (teknisiCount/routerCount/posCount/plan) | SUPER_ADMIN |
| `GET /admin/owners/:id` | Detail owner (subscription, usage, monitoring ringkas) | SUPER_ADMIN |
| `GET/POST/PATCH/DELETE /plans` | Kelola Plan (soft-delete via `isActive`) | SUPER_ADMIN |
| `GET /pos/transactions/stats?groupBy=day&from=&to=` | Chart POS harian (COUNT semua status per hari) | OWNER/TEKNISI/SA (scoped) |
| `GET /monitoring/health?serverId=&from=&to=&skip=&take=` | Histori healthcheck penuh | OWNER/TEKNISI/SA (scoped) |
| `GET /monitoring/health/summary?serverId=&days=30` | (opsional) agregat uptime/hari | idem |
| `GET /billing/invoices?skip=&take=` | Riwayat invoice owner (dari `PaymentTransaction`) | OWNER |

### Perluasan 🔶
- `GET /billing/me` → tambah `usage.teknisi {used,max}` + `aiAccess`/`apiKeyAccess`.
- `GET /auth/me` → kembalikan profil lengkap (`name,role,ownerId,createdAt`) — cek apakah sudah, saat ini sudah mengembalikan itu (verifikasi).
- Voucher **GET** (`/vouchers`, `/vouchers/stats`) → pastikan `@Roles` menyertakan `OWNER` (read-only). **Cek dulu**: sebagian sudah menyertakan OWNER.

### Urutan prioritas (saran FE)
1. **A3 (Plan fields)** + **A4 (POS harian)** + **B2 (health monitoring + scheduler)** — mengaktifkan Kelola Plan, chart dashboard, Monitoring Outlet yang sedang digarap FE.
2. **A1/A2 (agregat owner)** + **B1 (invoice + usage)**.
3. **B3/B4** (RBAC voucher owner + wiring profile) — paling ringan.

> ⚠️ Perhatikan konsistensi: perluasan `Plan` (aiAccess/apiKeyAccess/maxTeknisi) harus ikut ditegakkan
> di guard/limit yang relevan (mis. `assertCanAddRouter` sudah ada untuk router; tambah cek teknisi & akses AI/API-key).
> `billing.service.ts` sudah punya pola `getEffectiveLimit`/`ensureFreeSubscription` — reuse.

---

## 3. Cara kerja (workflow & konvensi) — WAJIB diikuti

### Git / push
- Commit biasa di `main`. **Push HANYA ke repo backend-only** lewat `./scripts/push-backend.sh` (cek dulu `--dry-run`). **Jangan** push ke `origin` (monorepo) kecuali diminta. Repo backend scope = `backend/`, `doc/`, `.gitignore` (tanpa `frontend/`, `CLAUDE.md`).

### Migrasi Prisma (GOTCHA penting)
`prisma migrate dev` **gagal di lingkungan non-interaktif** ("environment is non-interactive"). Alur yang berhasil:
```bash
cd backend
# 1. edit schema.prisma, lalu:
npx prisma format && npx prisma validate
# 2. generate SQL diff (DB harus up):
TS=$(date +%Y%m%d%H%M%S); DIR="prisma/migrations/${TS}_nama_migrasi"; mkdir -p "$DIR"
npx prisma migrate diff --from-config-datasource prisma.config.ts --to-schema prisma/schema.prisma --script \
  | grep -viE '^Loaded|^Prisma schema loaded|^$' > "$DIR/migration.sql"
# 3. terapkan + regen client:
npx prisma migrate deploy && npx prisma generate
```

### Konvensi kode
- **ESM**: import wajib sufiks `.js` walau sumber `.ts`.
- DTO + `class-validator`, pesan **Bahasa Indonesia**. ID `cuid()`. Tabel `@@map` snake_case jamak.
- Endpoint terproteksi: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(...)` + `@ApiBearerAuth('access-token')`.
- Scoping: `serverScopeWhere(user)` + `assertOwnerAccess(user, ownerId)` di [`common/scope.util.ts`](../backend/src/common/scope.util.ts). Pagination `{ data, meta:{total,skip,take} }`.
- **Wajib**: setiap endpoint baru → update `doc/api/<modul>.md` + `doc/BACKEND.md` (katalog) + uji runtime.

---

## 4. Cara jalankan & uji (env)

Prasyarat (semua ini kemungkinan **mati** di sesi baru — nyalakan dulu):
```bash
# 1. Docker (PostgreSQL :5433 + Redis :6379)
docker-compose up -d
# 2. Router uji MikroTik CHR (VirtualBox, IP 192.168.56.101, admin/admin123)
"/c/Program Files/Oracle/VirtualBox/VBoxManage.exe" startvm MikroTik-CHR --type headless
# 3. Backend
cd backend && npm run start:dev   # → http://localhost:4000/api ; Swagger /api/docs
```
- **Metode uji:** manual black-box `curl` (bukan jest). Akun seed: `admin@wifimanagement.local/admin123` (SA), `owner@…/owner123`, `teknisi@…/teknisi123`.
- Untuk uji endpoint yang menyentuh router: daftarkan server CHR dulu (`POST /servers` sbg teknisi, host `192.168.56.101:8728`) → `test-connection` harus ONLINE.

### Catatan state DB (dari sesi 2026-07-16)
DB dev saat ini berisi **data uji**: server `CHR-Lab`, ~59 voucher, transaksi POS, laporan AI, beberapa akun owner hasil register. Bila mau bersih: `npm run db:reset` (lalu `db:seed`) — **tapi** perlu daftar ulang server CHR untuk uji router.

### Gotcha lain
- **Login Google** butuh `GOOGLE_CLIENT_ID` di `.env` — kalau kosong `POST /auth/google` → **400** "belum dikonfigurasi". Belum di-set.
- **Duitku** mode Sandbox; `POST /billing/checkout` → **503** bila kredensial kosong.
- Mismatch port di doc frontend (`:4100`) vs backend nyata (`:4000`) — hanya urusan FE.

---

## 5. Status file saat ini
- `doc/2026-07-17-peta-endpoint-backend-untuk-frontend.md` (requirements FE) & dokumen ini **belum di-commit** (untracked). Commit + `./scripts/push-backend.sh` bila mau disimpan ke repo backend.
