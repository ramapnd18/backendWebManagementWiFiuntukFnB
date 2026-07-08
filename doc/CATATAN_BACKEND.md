# Catatan untuk Tim Backend — Web Management WiFi (P5)

**Dari:** tim Frontend · **Tanggal:** 2026-07-07
**Konteks:** hasil audit + implementasi frontend (Fase 0–3) menemukan sejumlah hal yang **hanya bisa diselesaikan di sisi backend**. Dokumen ini merangkum dari awal hingga akhir: tujuan, apa yang sudah dikerjakan frontend, temuan, dan aksi yang perlu backend lakukan.

Backend repo: `backend/src/modules/...` · Base API: `http://localhost:4000/api` · Frontend: `shadcn-admin` (Vite + React + TanStack Query).

---

## 1. Tujuan & Goals

**Tujuan besar:** ketika user memilih router di **"Pilih Router"**, seluruh halaman (`/dashboard`, `/profiles`, `/vouchers`, `/developer/keys`) menampilkan data **milik router itu saja**, akurat & sinkron dengan MikroTik.

**Goals konkret:**
1. Data per-halaman ter-scope ke router yang dipilih (tidak campur antar-router).
2. Isolasi antar-tenant aman (owner A tak bisa lihat/ubah data owner B).
3. Status router (`/servers`) mencerminkan kondisi nyata.
4. Data hotspot (user aktif, voucher) segar **< 5 detik** tanpa membebani router.

**Prinsip yang disepakati:** **filtering per-router = tanggung jawab backend (server-side)**, bukan frontend. Frontend sudah **mengirim** `serverId` dengan benar; backend yang perlu **menerapkannya** ke query. (Beberapa endpoint backend sudah benar — lihat §5 — tinggal disamakan.)

---

## 2. Apa yang sudah dikerjakan Frontend (ringkas Fase 0–3)

Semua sudah di-commit + terverifikasi end-to-end (Playwright + API + remote MikroTik asli).

| Fase | Isi | Status |
|------|-----|--------|
| **0** | Persist router terpilih (reload tak reset); profiles sync di-`await` refetch | ✅ |
| **1** | Migrasi data layer ke **React Query** (profiles, vouchers, activity, dashboard). Activity & dashboard polling 3s. Servers-store sengaja ditunda. | ✅ |
| **2.1** | Voucher create **single & batch** disambung ke API asli (dulu mock). Dropdown profil dinamis dari `GET /profiles`. | ✅ |
| **2.4** | Cleanup halaman voucher (search/filter fungsional, hapus mock mati, subtitle dinamis). | ✅ |
| **3** | Halaman **POS API Key** (`/developer/keys`) dari mock → CRUD asli `/pos-keys` + reveal raw key sekali. | ✅ |

**Frontend sudah mengirim `serverId` di semua request** (`?serverId=activeServerId` atau path `:serverId`). Yang menghalangi goal per-router ada di backend (§4).

---

## 3. Prinsip: kenapa filtering di backend, bukan frontend

1. **Konsistensi** — backend sudah filter server-side di sebagian endpoint (§5). Profiles/vouchers/pos-keys tinggal disamakan.
2. **Skala/performa** — "ambil semua lalu buang di client" boros bandwidth+memori dan membengkak seiring data.
3. **Keamanan/isolasi tenant** — mengirim semua data ke browser lalu menyembunyikan di JS **bukan** isolasi; data tetap sampai ke klien. Wajib backend (terutama `/pos-keys`).
4. **Statistik turunan benar** — kartu "Total di router ini", jumlah voucher, dll. hanya benar bila data memang per-router.

---

## 4. AKSI BACKEND (daftar temuan + perbaikan)

Urut prioritas. Tiap item: masalah → bukti → dampak → perbaikan.

| # | Temuan | Prioritas |
|---|--------|-----------|
| B1 | `GET /pos-keys` tanpa scope owner **& tanpa serverId** → bocor lintas-tenant | 🔴 **CRITICAL (security)** |
| B2 | `GET /profiles` abaikan `serverId` → campur antar-router | 🟠 High |
| B3 | `GET /vouchers` abaikan `serverId` → campur antar-router | 🟠 High |
| B4 | `/servers` `lastStatus` basi — tak ada health scheduler | 🟡 Medium |
| B5 | `/monitoring/*` kadang balas **500** saat polling | 🟡 Medium |
| B6 | `GET /vouchers` tanpa pagination/filter server-side | 🟡 Medium |
| B7 | Real-time < 5s belum terpenuhi (tak ada poller terpusat + SSE/WS) | 🔵 Roadmap |
| B8 | RBAC: OWNER **403** di `/profiles` & `/vouchers` — konfirmasi apakah disengaja | ⚪ Konfirmasi |
| B9 | `/profiles/sync` balas ringkasan, bukan list — opsi kembalikan list | ⚪ Opsional |
| B10 | `BACKEND.md` sudah usang (POS `/pos/v1` ditandai "belum ada" padahal jalan) | ⚪ Housekeeping |

### B1 — `GET /pos-keys` bocor lintas-tenant 🔴 CRITICAL
- **Masalah:** `pos-keys.service.ts` `findAll()` **tanpa argumen** (tak ada `user`) → `findMany()` mengembalikan **SEMUA POS key seluruh tenant**. Controller `pos-keys.controller.ts` `findAll()` hanya `JwtAuthGuard` (tanpa RolesGuard, tanpa scope owner).
- **Bukti:** `GET /pos-keys` sebagai user mana pun → daftar key milik semua owner. (POS doc §7 juga menandai ini: *"setiap user login (termasuk TEKNISI) bisa buat/list/revoke key untuk server mana pun"* + *"create() tidak men-scope serverId ke owner → potensi akses lintas-tenant"*.)
- **Dampak:** kebocoran data + user bisa **revoke/hapus** key milik outlet/tenant lain. Frontend **tidak bisa** menambal ini (data tetap terkirim ke klien).
- **Perbaikan:**
  ```ts
  // controller
  @Roles('OWNER', 'TEKNISI', 'SUPER_ADMIN')
  async findAll(@CurrentUser() user, @Query('serverId') serverId?: string) {
    return this.posKeysService.findAll(user, serverId)
  }
  // service — scope owner + optional serverId
  findMany({ where: { serverId, server: serverScopeWhere(user) } })
  ```
  Tambahkan `assertOwnerAccess` di `create/update/remove` pos-key juga (validasi server milik owner).

### B2 — `GET /profiles` abaikan `serverId` 🟠
- **Masalah:** `profiles.controller.ts:62` `findAll(@CurrentUser() user)` **tanpa param serverId**. `profiles.service.ts:98`:
  ```ts
  findMany({ where: { server: serverScopeWhere(user) } })   // scope owner saja
  ```
- **Bukti (terverifikasi):** `GET /profiles?serverId=wey` dan `?serverId=lyf` mengembalikan **4 baris yang sama persis**; field `serverId` tiap baris menunjukkan 2 milik wey, 2 milik lyf. Sync sendiri **BENAR** (dicek ke MikroTik asli via `routeros-client`: router wey punya 2 profil `default`+`gfd`, cocok dengan DB). Ilusi "sync gagal" murni karena filter GET yang bocor.
- **Dampak:** halaman `/profiles` untuk router A menampilkan profil router lain → tampak "tidak sinkron".
- **Perbaikan:**
  ```ts
  async findAll(@CurrentUser() user, @Query('serverId') serverId?: string) { ... }
  findMany({ where: { serverId, server: serverScopeWhere(user) } })
  ```

### B3 — `GET /vouchers` abaikan `serverId` 🟠
- **Masalah:** `vouchers.controller.ts` `findAll(@CurrentUser() user)` — pola sama, tanpa serverId. Halaman `/vouchers` (dan jumlah voucher di `/dashboard`) ikut campur antar-router.
- **Perbaikan:** sama seperti B2 — tambah `@Query('serverId')` + `where: { serverId, ... }`. Sekalian sediakan filter `profileId`/`status`/`search` (untuk B6).

### B4 — `/servers` `lastStatus` basi 🟡
- **Masalah:** `lastStatus` hanya diperbarui saat **"Test Koneksi" manual**; tak ada job periodik. Ada kolom `lastCheckedAt` (bagus).
- **Bukti:** wey pernah tampil `OFFLINE` padahal router **reachable** (sync & monitoring jalan).
- **Perbaikan:** scheduler (cron/BullMQ repeatable) ping tiap router tiap N detik → update `lastStatus` + `lastCheckedAt`. Frontend sudah siap: `useQuery` list server dengan `refetchInterval` akan menampilkan status segar + "diperiksa Xs lalu".

### B5 — `/monitoring/*` kadang 500 🟡
- **Masalah:** saat dashboard polling tiap 3s, `/monitoring/traffic|active|resources/:serverId` **kadang** balas `500` (bukan `403`/`502`). Kadang balas 200 normal.
- **Dampak:** dashboard menandai router "disconnected" secara keliru + spam error.
- **Perbaikan:** bungkus kegagalan koneksi router → balas `502`/payload kosong yang terdefinisi, bukan `500` mentah. Selidiki penyebab intermittent (timeout? race koneksi RouterOS?).

### B6 — `GET /vouchers` tanpa pagination server-side 🟡
- **Masalah:** balas seluruh set voucher; frontend paginasi **client-side** (tak scale).
- **Perbaikan:** tambah `skip`/`take` + filter (`serverId`, `profileId`, `status`, `search`) — **tiru pola `/activity-log`** yang sudah paginated.

### B7 — Real-time < 5 detik 🔵 (Roadmap)
- **Masalah:** monitoring = live-query per request (N klien menggandakan beban router); tak ada snapshot bersama; NFR-2.4 (<5s) belum terpenuhi; F14 (WebSocket/SSE) ❌ belum dibangun.
- **Perbaikan (sesuai `ARSITEKTUR.md §10.1`):** **1 poller terpusat per router** (interval ~2–3s) + diff vs snapshot (Redis) + **push SSE** ke browser (atau minimal endpoint cache yang frontend `refetchInterval`-kan). Router di-poll sekali berapapun jumlah klien → melindungi router. Frontend siap konsumsi SSE atau polling ke cache.

### B8 — OWNER 403 di `/profiles` & `/vouchers` ⚪ (Konfirmasi)
- **Fakta:** `profiles.controller` & `vouchers.controller` `@Roles('TEKNISI','SUPER_ADMIN')` → **OWNER dapat 403** (bahkan GET). TEKNISI & SUPER_ADMIN lolos.
- **Pertanyaan:** apakah memang OWNER **tidak boleh** lihat profil/voucher? Kalau owner seharusnya bisa (minimal read), tambahkan `'OWNER'` ke `@Roles`. Kalau disengaja (profil = config teknis), abaikan — frontend tinggal sembunyikan menu untuk role OWNER.

### B9 — `/profiles/sync` kembalikan list ⚪ (Opsional)
- **Fakta:** `POST /profiles/sync/:serverId` balas objek ringkasan (`{totalRouterProfiles, importedCount, ...}`), bukan list profil hasil. Frontend harus GET ulang setelahnya.
- **Opsional:** kembalikan juga daftar profil final → frontend bisa `setQueryData` tanpa 1 request tambahan. (Bukan bug; optimasi.)

### B10 — `BACKEND.md` usang ⚪ (Housekeeping)
- `BACKEND.md` menandai `POST /api/pos/v1/trigger-voucher` **"❌ BELUM ADA"**, padahal **sudah jalan** (lihat verifikasi §6). Mohon perbarui dok agar tidak menyesatkan.

---

## 5. Endpoint yang SUDAH BENAR (jadikan acuan)

Backend sudah menerapkan scoping server-side di sini — perbaikan B1–B3/B6 = menyamakan ke pola ini:

| Endpoint | Pola scoping | Status |
|----------|--------------|--------|
| `/monitoring/*/:serverId` | path param `:serverId` | ✅ benar |
| `/activity-log?serverId=&skip=&take=&action=` | `@Query` + paginated | ✅ benar (acuan) |

---

## 6. Verifikasi yang sudah dilakukan (bukti temuan valid)

- **Router asli** dibaca langsung via `routeros-client` (`/ip/hotspot/user/profile`): wey = 2 profil (`default`, `gfd 1m/2m`) → **cocok** dengan DB → sync benar; masalah murni di GET filter (B2).
- **Perbandingan** `GET /profiles?serverId=wey` vs `?serverId=lyf` → daftar identik → konfirmasi B2.
- **`GET /pos-keys`** dites → balas count global tanpa scope → konfirmasi B1.
- **POS Side-B** (`x-api-key`) diuji dengan key `pos_e37c…`: `GET /pos/v1/profiles` 200 → `POST /pos/v1/trigger-voucher` **201** (voucher `911492` dibuat di DB + MikroTik) → replay `transactionId` sama **200** (idempoten, tak dobel). **Modul POS `/pos/v1` berfungsi** (kontra B10).

---

## 7. Catatan environment (untuk reproduksi)

- **Server ter-wipe di tengah sesi.** Frontend me-`POST /servers` ulang router **"wey"** (host `10.168.27.200:8728`, admin/admin) sebagai TEKNISI `naril4860@gmail.com` → id baru `cmraar0oe0000rcus8h5prp1v`, owner `cmr1j6mq50001zcus05vhyeu7`, lalu di-sync (profil `default`+`gfd` masuk DB). Voucher tes `911492` (outlet "Test Outlet") masih ada — hapus bila perlu.
- **Akun seed teknisi untuk wey:** `naril4860@gmail.com` / `admin123` (role TEKNISI). Juga `admin@wifimanagement.local`/`admin123` (SUPER_ADMIN).

---

## 8. Prioritas & urutan saran

1. **B1** (security lintas-tenant) — segera.
2. **B2 + B3** (filter serverId profiles/vouchers) — satu paket, pola sama, cepat.
3. **B6** (pagination voucher) — sekalian saat B3.
4. **B4** (health scheduler) — perbaiki badge `/servers`.
5. **B5** (monitoring 500) — investigasi.
6. **B8** (konfirmasi RBAC OWNER) — keputusan produk.
7. **B7** (real-time SSE) — roadmap terpisah, effort besar.
8. **B9, B10** — housekeeping.

Perbaikan B1–B3 kecil & seragam (tambah `@Query('serverId')` + `where` scope). Setelah itu, goal "Pilih Router menyaring semua halaman" langsung tercapai — frontend sudah siap, tak perlu perubahan tambahan.

---

*Disusun tim Frontend dari audit + implementasi + verifikasi (API, Playwright, remote MikroTik) per 2026-07-07. Detail fase frontend: `ROADMAP_FRONTEND.md`. Kontrak POS: `POS_API_KEY_FRONTEND_INTEGRATION.md`.*
