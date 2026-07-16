# API — Profiles (Profil Hotspot)

**Modul:** `profiles` (`ProfilesController` + `ProfilesService`).
**Status:** ✅ Implementasi selesai & terverifikasi runtime (2026-07-16) — diuji terhadap MikroTik CHR 7.19.3 (`192.168.56.101:8728`).
**Base URL:** `http://localhost:4000/api`

Profil hotspot = konfigurasi teknis paket WiFi (bandwidth `rate-limit`, durasi, `shared-users`).
Setiap mutasi **disinkronkan langsung ke router MikroTik** (create/patch/delete di `/ip/hotspot/user/profile`).
Semua endpoint butuh **JWT** (`Authorization: Bearer <token>`).

> Profil = konfigurasi teknis → **mutasi hanya TEKNISI & SUPER_ADMIN**. OWNER **boleh read-only**
> (list & detail, ter-scope router miliknya), tetapi **create/update/delete → 403**.

---

## Konsep

- **HotspotProfile** milik satu `MikrotikServer` (router). Unik per `[serverId, name]` (nama profil tak boleh dobel di satu router).
- Field: `name` (tanpa spasi, pakai underscore), `rateLimit` (`up/down`, mis. `2M/2M`), `sessionTimeout`,
  `idleTimeout`, `sharedUsers` (default 1), `validity` (mis. `1d`), `description`, `syncedToRouter`.
- **`syncedToRouter`**: `true` bila berhasil di-push ke router; bila router offline saat create/update,
  profil tetap tersimpan di DB dengan `syncedToRouter: false` (tidak gagal total).
- **Scoping** (`serverScopeWhere` / `assertOwnerAccess`): SUPER_ADMIN = semua; OWNER = router miliknya;
  TEKNISI = router milik Owner-nya. Akses ke router milik Owner lain → **403**.

---

## Matriks Akses

| Endpoint | SUPER_ADMIN | OWNER | TEKNISI |
|----------|:-:|:-:|:-:|
| `POST /profiles` | ✅ | ❌ 403 | ✅ |
| `GET /profiles` | ✅ (semua) | ✅ (miliknya, read-only) | ✅ (milik Owner) |
| `GET /profiles/:id` | ✅ | ✅ (miliknya, read-only) | ✅ |
| `PATCH /profiles/:id` | ✅ | ❌ 403 | ✅ |
| `DELETE /profiles/:id` | ✅ | ❌ 403 | ✅ |
| `POST /profiles/sync/:serverId` | ✅ | ❌ 403 | ✅ |

> Semua data list/detail otomatis ter-scope: OWNER/TEKNISI hanya melihat profil pada router milik Owner.

---

## Endpoint

### 1. Buat profil — `POST /api/profiles`

Role: **TEKNISI / SUPER_ADMIN**. Membuat profil di DB **dan** mem-push ke router MikroTik.

**Request Payload** (`CreateProfileDto`)
```jsonc
{
  "serverId": "cmpnoc2ea0000o0ustysa8zf5", // WAJIB
  "name": "Paket_1_Jam",                   // WAJIB — tanpa spasi (pakai underscore)
  "rateLimit": "2M/2M",                    // WAJIB — uplink/downlink
  "sessionTimeout": "1h",                  // opsional
  "idleTimeout": "10m",                    // opsional
  "sharedUsers": 1,                        // default 1, minimal 1
  "validity": "1d",                        // opsional
  "description": "Voucher 1 Jam Wifi Kafe" // opsional
}
```

**Response 201 (Success)**
```jsonc
{
  "id": "cmp1...",
  "serverId": "cmpnoc2ea0000o0ustysa8zf5",
  "name": "Paket_1_Jam",
  "rateLimit": "2M/2M",
  "sessionTimeout": "1h",
  "idleTimeout": "10m",
  "sharedUsers": 1,
  "validity": "1d",
  "description": "Voucher 1 Jam Wifi Kafe",
  "syncedToRouter": true,   // dibuat & di-push ke router
  "createdAt": "2026-07-16T...",
  "updatedAt": "2026-07-16T..."
}
```

**Response 400 (Error — nama duplikat di router yang sama)**
```json
{ "statusCode": 400, "message": "Profil dengan nama \"Paket_1_Jam\" sudah terdaftar pada router ini", "error": "Bad Request" }
```

**Response 403 (Error — OWNER / router bukan milik Anda)**
```json
{ "statusCode": 403, "message": "Anda tidak punya hak akses untuk resource ini", "error": "Forbidden" }
```

**Response 404 (Error — router tidak ditemukan)**
```json
{ "statusCode": 404, "message": "Router dengan ID cmpnoc... tidak ditemukan", "error": "Not Found" }
```

---

### 2. Daftar profil — `GET /api/profiles`

Role: **OWNER (read-only) / TEKNISI / SUPER_ADMIN**. Ter-scope per Owner.

**Query (opsional):** `serverId` — filter satu router.

**Response 200 (Success)** — array, tiap item menyertakan relasi ringkas `server: { name }`:
```jsonc
[
  {
    "id": "cmp1...",
    "serverId": "cmq1...",
    "name": "Paket_1_Jam",
    "rateLimit": "2M/2M",
    "sharedUsers": 1,
    "validity": "1d",
    "syncedToRouter": true,
    "server": { "name": "CHR-Lab" },
    "createdAt": "2026-07-16T...",
    "updatedAt": "2026-07-16T..."
  }
]
```

---

### 3. Detail profil — `GET /api/profiles/:id`

Role: **OWNER (read-only) / TEKNISI / SUPER_ADMIN**. Menyertakan relasi `server` lengkap.

**Response 200 (Success):** objek profil.
**Response 404 (Error):** `{ "statusCode": 404, "message": "Profil Hotspot dengan ID ... tidak ditemukan", "error": "Not Found" }`

---

### 4. Update profil — `PATCH /api/profiles/:id`

Role: **TEKNISI / SUPER_ADMIN**. Body sama dengan create, semua field **opsional** (`UpdateProfileDto` = partial).
Sinkronisasi ke router memakai taktik **hapus profil lama → buat ulang** (paling aman di MikroTik).
Bila push gagal (router offline) → `syncedToRouter: false`, data DB tetap tersimpan.

**Request Payload (contoh)**
```json
{ "rateLimit": "4M/4M", "sharedUsers": 2 }
```

**Response 200 (Success):** objek profil terupdate.
**Response 400 (Error):** ganti nama ke nama yang sudah dipakai di router yang sama.
**Response 404 (Error):** profil tidak ditemukan.

---

### 5. Hapus profil — `DELETE /api/profiles/:id`

Role: **TEKNISI / SUPER_ADMIN**. Menghapus profil di DB **dan** menyingkirkannya dari MikroTik.
Kegagalan hapus di router hanya di-log (tidak menggagalkan penghapusan di DB).

**Response 200 (Success):** objek profil yang dihapus.
**Response 404 (Error):** profil tidak ditemukan.

---

### 6. Sinkronisasi dari router — `POST /api/profiles/sync/:serverId`

Role: **TEKNISI / SUPER_ADMIN**. **Menarik (impor)** profil hotspot **dan** voucher yang sudah ada di
router ke DB lokal. Berguna saat mengadopsi router yang sudah punya konfigurasi. Seluruh mutasi DB
dibungkus **satu transaksi** (atomik).

**Perilaku:**
1. Ambil daftar profil + user + active-user dari router (real-time).
2. **Penyelarasan profil:** profil di DB yang tak ada lagi di router → dihapus (beserta vouchernya);
   profil dari router → di-upsert ke DB (`syncedToRouter: true`, `description: "Diimpor otomatis..."`).
3. **Penyelarasan voucher** — hanya bila daftar user berhasil ditarik (`usersSynced: true`, guard anti "web kosong"):
   voucher lokal yang tak ada di router dihapus; tiap user router di-upsert jadi voucher
   (`USED` bila punya uptime/traffic/aktif, selain itu `UNUSED`).

**Response 200 (Success)** — mengembalikan ringkasan hitungan impor + daftar profil FINAL:
```jsonc
{
  "serverId": "cmq1...",
  "totalRouterProfiles": 2,
  "importedCount": 1,          // profil baru diimpor
  "deletedProfilesCount": 0,
  "deletedVouchersCount": 0,
  "importedVouchersCount": 55, // voucher diselaraskan dari user router
  "usersSynced": true,
  "imported": [ /* profil baru */ ],
  "profiles": [ /* daftar profil FINAL setelah sync */ ]
}
```

**Response 404 (Error — router tidak ditemukan)**
```json
{ "statusCode": 404, "message": "Router dengan ID ... tidak ditemukan", "error": "Not Found" }
```

---

## Hasil Uji Runtime (2026-07-16)

Router uji: **MikroTik CHR 7.19.3** (`192.168.56.101:8728`, RouterOS API binary) — ONLINE.
Akun: `teknisi` (TEKNISI), `owner` (OWNER, paket FREE). Server: `CHR-Lab` (milik owner).

| # | Skenario | Role | Hasil | Catatan |
|---|----------|:-:|:-:|---------|
| 1 | `POST /profiles` | TEKNISI | **201** | `{...,"syncedToRouter":true}` — dibuat & di-push ke router |
| 2 | `POST /profiles` (role) | OWNER | **403** | Owner dilarang mutasi profil |
| 3 | `GET /profiles` | OWNER | **200** | array, ter-scope, include `server:{name}` |
| 4 | `GET /profiles/:id` | TEKNISI | **200** | detail + relasi `server` |
| 5 | `PATCH /profiles/:id` | TEKNISI | **200** | re-sync ke router (hapus lama → buat ulang) |
| 6 | `DELETE /profiles/:id` | TEKNISI | **200** | dihapus di DB + router |
| 7 | `POST /profiles/sync/:serverId` | TEKNISI | **200** | `{totalRouterProfiles:2, importedCount:1, deletedProfilesCount:0, deletedVouchersCount:0, importedVouchersCount:55, usersSynced:true, imported:[...]}` |
