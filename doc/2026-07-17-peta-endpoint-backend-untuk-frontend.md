# Peta Kebutuhan Endpoint Backend — untuk Frontend

**Tanggal:** 2026-07-17
**Untuk:** Tim Backend (NestJS + Prisma)
**Dari:** Frontend
**Base URL:** `http://localhost:4000/api` · **Auth:** JWT Bearer · **Swagger:** `/api/docs`

Dokumen ini memetakan endpoint yang **dibutuhkan frontend** tapi belum tersedia / perlu
diperluas, berdasarkan audit schema & controller backend saat ini.

## Konvensi (ikuti yang sudah ada)

- **Pagination seragam:** `{ data: [...], meta: { total, skip, take } }`.
- **RBAC:** `SUPER_ADMIN` / `OWNER` / `TEKNISI`. Scope via `serverScopeWhere(user)`
  (SA = semua; OWNER/TEKNISI = miliknya) dan relasi `server → ownerId`.
- **401** token invalid · **403** role/lintas-owner · **404** tak ditemukan.

## Legenda status

| Simbol | Arti |
|--------|------|
| ✅ | Sudah ada — tinggal dipakai / wiring FE |
| 🔶 | Ada, **perlu diperluas** |
| 🆕 | **Baru** — belum ada |

---

# A. SUPER ADMIN

## A1. Kelola Owner — daftar + agregat 🆕

Tabel kolom: **Nama · Email · Plan · Teknisi · Router · Transaksi POS**.

`GET /admin/owners` — Roles: `SUPER_ADMIN`
Query: `skip`, `take`, `search` (nama/email), `planCode?`

```jsonc
{
  "data": [
    {
      "id": "cuid",
      "name": "Budi",
      "email": "budi@toko.com",
      "plan": { "code": "STANDARD", "name": "Standar" },   // dari Subscription ACTIVE → Plan; null jika tak ada
      "teknisiCount": 3,     // COUNT User role=TEKNISI, ownerId = owner.id
      "routerCount": 2,      // COUNT MikrotikServer ownerId = owner.id
      "posCount": 512,       // COUNT PosTransaction pada server milik owner
      "createdAt": "2026-05-01T..."
    }
  ],
  "meta": { "total": 30, "skip": 0, "take": 10 }
}
```

> `GET /users?role=OWNER` (existing) hanya kembalikan user polos — **tak ada** kolom
> agregat (teknisi/router/pos count). Rekomendasi: endpoint khusus `/admin/owners` agar
> `/users` tetap ramping. Boleh juga jadi `GET /users?role=OWNER&withStats=true`.

## A2. Detail Owner 🆕

`GET /admin/owners/:id` — Roles: `SUPER_ADMIN`

```jsonc
{
  "id": "cuid", "name": "Budi", "email": "budi@toko.com", "createdAt": "...",
  "subscription": {
    "plan": { "code": "STANDARD", "name": "Standar", "price": 150000,
              "durationDays": 30, "maxRouters": 5, "maxTeknisi": 3,
              "aiAccess": true, "apiKeyAccess": true },
    "status": "ACTIVE", "startedAt": "...", "expiredAt": "2026-08-01T..."   // masa berlaku
  },
  "usage": {                            // "Kuota terpakai dari paket"
    "routers":  { "used": 2, "max": 5 },
    "teknisi":  { "used": 3, "max": 3 },
    "aiAccess": true, "apiKeyAccess": true
  },
  "monitoring": {                       // ringkasan status outlet owner (detail → lihat B2)
    "outlets": [ { "serverId": "...", "name": "Outlet A", "lastStatus": "ONLINE", "lastCheckedAt": "..." } ]
  }
}
```

## A3. Kelola Plan (CRUD) 🆕 + perubahan schema

**Perubahan schema `Plan`** (sekarang cuma `maxRouters`, `price`, `durationDays`):

```prisma
model Plan {
  // ...existing: code, name, maxRouters, price, durationDays, isActive
  maxTeknisi   Int      // batas jumlah teknisi
  aiAccess     Boolean  @default(false)  // akses fitur AI (analisis + chat)
  apiKeyAccess Boolean  @default(false)  // boleh buat POS API key / integrasi
}
```

Endpoints — Roles: `SUPER_ADMIN`:

| Verb | Path | Fungsi |
|------|------|--------|
| GET | `/plans` | List **semua** plan (termasuk `isActive=false`) |
| POST | `/plans` | Buat plan baru |
| PATCH | `/plans/:id` | Update (partial) |
| DELETE | `/plans/:id` | Hapus / non-aktifkan |

Body POST/PATCH:
```jsonc
{
  "code": "STANDARD",       // unik, stabil
  "name": "Standar",        // tampilan
  "price": 150000,          // Rupiah (0 = gratis)
  "durationDays": 30,       // "Masa"; null = tak kadaluarsa
  "maxRouters": 5,
  "maxTeknisi": 3,
  "aiAccess": true,
  "apiKeyAccess": true,
  "isActive": true
}
```

> Pemetaan istilah UI: **Nama**=`name`, **Masa**=`durationDays`, **Harga**=`price`,
> **Akses plan**=`maxRouters`/`maxTeknisi`/`aiAccess`/`apiKeyAccess`.
> `DELETE` disarankan **soft-delete** (`isActive=false`) bila masih ada Subscription memakai.
> `GET /billing/plans` (existing) = list paket **aktif** untuk owner upgrade; `/plans` =
> manajemen penuh SA (tampilkan yang non-aktif juga).

## A4. Transaksi POS harian (agregat) 🆕

Untuk chart **"Transaksi POS harian"** — butuh jumlah transaksi per hari (bukan data mentah).

`GET /pos/transactions/stats?groupBy=day&from=&to=` — Roles: `OWNER`/`TEKNISI`/`SUPER_ADMIN`
(scope otomatis; SA = global). Default rentang: 30 hari terakhir bila `from`/`to` kosong.

```jsonc
{ "data": [ { "date": "2026-07-01", "count": 42 }, { "date": "2026-07-02", "count": 55 } ] }
```

- Hitung **SEMUA status** (SUCCESS + FAILED) — sesuai keputusan.
- Bucket per hari (`DATE(createdAt)` di timezone server), `COUNT(*)`.
- Bonus: endpoint ini juga memungkinkan **badge tren** (minggu ini vs lalu) di kartu POS
  dashboard SA/owner yang sebelumnya di-drop karena tak ada filter tanggal.

---

# B. OWNER

## B1. Langganan (Paket + Kuota + Invoice)

**Paket saat ini + kuota** — `GET /billing/me` (existing) 🔶 **perluas**:

```jsonc
{
  "plan": { "code": "STANDARD", "name": "Standar", "price": 150000, "durationDays": 30,
            "maxRouters": 5, "maxTeknisi": 3, "aiAccess": true, "apiKeyAccess": true },
  "subscription": { "status": "ACTIVE", "startedAt": "...", "expiredAt": "2026-08-01T..." },
  "usage": {
    "routers": { "used": 2, "max": 5 },
    "teknisi": { "used": 3, "max": 3 },   // TAMBAHAN (sekarang baru kuota router)
    "aiAccess": true, "apiKeyAccess": true
  }
}
```

**Riwayat Invoice** — `GET /billing/invoices?skip=&take=` 🆕 — Roles: `OWNER`.
Sumber: model `PaymentTransaction` (sudah ada).

```jsonc
{
  "data": [
    { "id": "...", "merchantOrderId": "INV-...", "plan": { "code": "STANDARD", "name": "Standar" },
      "amount": 150000, "status": "PAID", "paymentMethod": "VA", "paidAt": "...",
      "createdAt": "...", "paymentUrl": null }
  ],
  "meta": { "total": 8, "skip": 0, "take": 10 }
}
```

## B2. Monitoring Outlet — histori healthcheck 🆕 (model + endpoint + scheduler)

**Konsep:** backend cek koneksi tiap router secara periodik (mis. **tiap 1 menit**:
ping / test-connect), lalu **CATAT SETIAP hasil** (OK maupun gagal) ke tabel khusus —
sehingga owner bisa melihat histori **menyeluruh** ("Router A, tgl sekian jam sekian,
koneksi aman", dst).

**Schema baru:**
```prisma
model RouterHealthCheck {
  id        String       @id @default(cuid())
  serverId  String
  status    ServerStatus // ONLINE | OFFLINE (hasil cek)
  latencyMs Int?         // opsional (ms) bila ONLINE
  checkedAt DateTime     @default(now())

  server MikrotikServer @relation(fields: [serverId], references: [id], onDelete: Cascade)
  @@index([serverId, checkedAt])
  @@map("router_health_checks")
}
```
+ **scheduler** (cron/interval, mis. 60 detik) yang cek semua router & tulis 1 baris per router.

**Endpoint — SELURUH log (sesuai permintaan owner: lihat menyeluruh):**
`GET /monitoring/health?serverId=&from=&to=&skip=&take=` — Roles: `OWNER`/`TEKNISI`/`SUPER_ADMIN`
(scope otomatis; SA global).
```jsonc
{
  "data": [
    { "id": "...", "serverId": "...", "serverName": "Outlet A",
      "status": "ONLINE", "latencyMs": 12, "checkedAt": "2026-07-17T10:31:00Z" }
  ],
  "meta": { "total": 4320, "skip": 0, "take": 50 }
}
```

**(Opsional, disarankan) agregat per hari** untuk timeline 30-hari + availability di dashboard:
`GET /monitoring/health/summary?serverId=&days=30`
```jsonc
{ "data": [ { "date": "2026-07-01", "checks": 1440, "fails": 3, "uptimePct": 99.79, "downtimeMinutes": 3 } ] }
```
> Kalau `/summary` tak dibuat, frontend agregat dari log mentah — tapi berat bila datanya besar,
> jadi `/summary` lebih disarankan untuk kartu dashboard.

> Beda dari `/activity-log/router-connections` (existing) yang **hanya mencatat kegagalan**
> koneksi — endpoint ini mencatat **semua** cek (termasuk status OK) sebagai histori penuh.
> Perlu kebijakan **retensi** (mis. simpan 30–90 hari lalu prune) agar tabel tak membengkak.

## B3. Voucher Hotspot — akses OWNER (read-only) 🔶 RBAC

- Owner boleh **melihat** voucher: `GET /vouchers`, `GET /vouchers/stats`, PDF publik.
  → pastikan `@Roles(...)` pada endpoint **GET** voucher menyertakan `OWNER`.
- Owner **TIDAK** boleh mutasi (create/single/batch/revoke/delete) — tetap **read-only**
  sesuai keputusan. Generate voucher tetap `TEKNISI` + POS (`x-api-key`).

## B4. Profile owner ✅ (tinggal wiring FE) / 🔶 minor

- **Lihat profil:** `GET /auth/me` (existing) — pastikan kembalikan
  `{ id, name, email, role, ownerId, createdAt }`. Bila sekarang minimal (hanya id/email
  dari JWT payload), **perluas** ke profil lengkap.
- **Edit nama & ganti password:** `PATCH /users/:id` (existing) — owner edit dirinya sendiri,
  dukung body `{ name?, password? }`. **Tak perlu endpoint baru.**

---

# C. TEKNISI

Sudah cukup dengan endpoint existing (voucher penuh, `/monitoring`, `/pos/transactions`, dll).
Otomatis ikut kebagian endpoint baru yang role-nya menyertakan TEKNISI:
`GET /monitoring/health` (B2) & `GET /pos/transactions/stats` (A4).

---

# D. Ringkasan

### Perubahan schema
- `Plan` **+=** `maxTeknisi` (Int), `aiAccess` (Boolean), `apiKeyAccess` (Boolean).
- **Model baru** `RouterHealthCheck` + scheduler cek periodik + kebijakan retensi.

### Endpoint baru 🆕
| Endpoint | Untuk |
|----------|-------|
| `GET /admin/owners` | Kelola Owner (tabel + agregat) |
| `GET /admin/owners/:id` | Detail owner (plan, usage, monitoring) |
| `GET/POST/PATCH/DELETE /plans` | Kelola Plan (SA) |
| `GET /pos/transactions/stats` | Chart POS harian |
| `GET /monitoring/health` | Histori healthcheck (log penuh) |
| `GET /monitoring/health/summary` | (opsional) agregat uptime per hari |
| `GET /billing/invoices` | Riwayat invoice owner |

### Perluasan 🔶
| Endpoint | Perubahan |
|----------|-----------|
| `GET /billing/me` | + usage teknisi + fitur (aiAccess/apiKeyAccess) |
| `GET /auth/me` | kembalikan profil lengkap (name/role/createdAt/ownerId) |
| Voucher GET (`/vouchers`, `/vouchers/stats`) | izinkan role `OWNER` (read-only) |

### Saran prioritas
1. **A3 (Plan fields)** + **A4 (POS harian)** + **B2 (health monitoring)** → langsung mengaktifkan Kelola Plan, chart dashboard, dan Monitoring Outlet yang sedang digarap FE.
2. **A1/A2 (agregat owner)** + **B1 (invoice + usage)** → halaman Kelola Owner (SA) & Langganan (owner).
3. **B3/B4** → RBAC voucher owner + wiring Profile (paling ringan).
