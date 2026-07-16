# API — Servers (Router MikroTik)

**Modul:** `servers` (`ServersController` + `ServersService`).
**Status:** ✅ terverifikasi runtime 2026-07-16 (router uji MikroTik CHR 7.19.3 `192.168.56.101:8728`, ONLINE).
**Base URL:** `http://localhost:4000/api`

Modul CRUD router MikroTik + uji koneksi real-time (RouterOS API binary, port 8728 / 8729 TLS).
Password router **dienkripsi AES-256-GCM at-rest** (`common/crypto.util.ts`) dan **selalu di-strip**
dari setiap response. Jumlah router per Owner dibatasi kuota paket langganan (lihat [`billing.md`](./billing.md)).

---

## Konsep & Aturan

- **Kepemilikan:** router (`MikrotikServer`) dimiliki OWNER. `ownerId` diturunkan otomatis dari user
  yang membuat (OWNER → dirinya; TEKNISI → Owner-nya) via `effectiveOwnerId()`. Body tidak menentukan `ownerId`.
- **Scoping baca:** SUPER_ADMIN = semua router; OWNER = miliknya (`ownerId = id`); TEKNISI = milik Owner-nya
  (`ownerId = ownerId`). Akses ke router milik Owner lain → **403** "Anda tidak punya akses ke resource ini".
- **Kuota:** `POST /servers` memanggil `BillingService.assertCanAddRouter(ownerId)` lebih dulu. Kuota penuh /
  langganan kadaluarsa → **403** (`"Kuota router penuh (1/1). Upgrade paket untuk menambah router."`).
- **Password:** dienkripsi saat `create`/`update` (bila diisi; string kosong = tidak diubah) dan
  **tidak pernah** dikembalikan ke klien.
- **Duplikat host:** ditolak **400** per-owner saat `create` (`"Router dengan IP/Host ... sudah terdaftar"`).

---

## Matriks Akses

| Endpoint | SUPER_ADMIN | OWNER | TEKNISI |
|----------|:-:|:-:|:-:|
| `POST /servers` | ✅ | ❌ 403 | ✅ |
| `GET /servers` | ✅ (semua) | ✅ (miliknya) | ✅ (milik Owner) |
| `GET /servers/:id` | ✅ | ✅ (miliknya) | ✅ (milik Owner) |
| `PATCH /servers/:id` | ✅ | ❌ 403 | ✅ (milik Owner) |
| `DELETE /servers/:id` | ✅ | ❌ 403 | ✅ (milik Owner) |
| `POST /servers/:id/test-connection` | ✅ | ❌ 403 | ✅ (milik Owner) |
| `POST /servers/test-connection-custom` | ✅ | ❌ 403 | ✅ |
| `POST /servers/refresh-status` | ✅ | ❌ 403 | ✅ |

> Semua endpoint butuh JWT (`@UseGuards(JwtAuthGuard, RolesGuard)`). Tanpa token → **401**.

---

## Endpoint

### 1. Daftarkan router — `POST /api/servers`

Butuh JWT (**TEKNISI / SUPER_ADMIN**). OWNER → **403**.

**Request Payload** (`CreateServerDto`)
```jsonc
{
  "name": "CHR-Lab",             // wajib
  "host": "192.168.56.101",      // wajib — IP/domain router
  "port": 8728,                  // opsional (default 80, atau 443 bila useSSL). RouterOS API: 8728 / 8729 TLS
  "username": "admin",           // wajib
  "password": "admin",           // wajib — dienkripsi AES-256-GCM at-rest
  "useSSL": false,               // opsional (default false)
  "hotspotName": "hotspot1",     // opsional — nama server hotspot di router
  "dnsName": "hotspot.wifi.com"  // opsional — DNS captive portal
}
```

**Response 201 (Success)** — password **di-strip**:
```jsonc
{
  "id": "cmq...",
  "ownerId": "cmqw...",
  "name": "CHR-Lab",
  "host": "192.168.56.101",
  "port": 8728,
  "username": "admin",
  "useSSL": false,
  "lastStatus": "UNKNOWN",
  "lastCheckedAt": null,
  "createdAt": "2026-07-16T...",
  "updatedAt": "2026-07-16T..."
}
```

**Response 403 (Error — Owner mencoba / bukan hak akses)**
```json
{ "statusCode": 403, "message": "Anda tidak punya hak akses untuk resource ini", "error": "Forbidden" }
```

**Response 403 (Error — kuota penuh)**
```json
{ "statusCode": 403, "message": "Kuota router penuh (1/1). Upgrade paket untuk menambah router.", "error": "Forbidden" }
```

**Response 400 (Error — host duplikat)**
```json
{ "statusCode": 400, "message": "Router dengan IP/Host 192.168.56.101 sudah terdaftar", "error": "Bad Request" }
```

---

### 2. Daftar router — `GET /api/servers`

Butuh JWT (semua role). Hasil ter-scope otomatis. Password di-strip.

**Response 200 (Success)**
```jsonc
[
  {
    "id": "cmq...",
    "ownerId": "cmqw...",
    "name": "CHR-Lab",
    "host": "192.168.56.101",
    "port": 8728,
    "username": "admin",
    "useSSL": false,
    "lastStatus": "ONLINE",
    "lastCheckedAt": "2026-07-16T...",
    "createdAt": "...",
    "updatedAt": "..."
  }
]
```

---

### 3. Refresh status semua router — `POST /api/servers/refresh-status`

Butuh JWT (**TEKNISI / SUPER_ADMIN**). Uji koneksi semua router ter-scope secara paralel,
perbarui `lastStatus` + `lastCheckedAt` di DB, lalu kembalikan daftar terbaru (password di-strip).
Dipakai sinkronisasi status terpusat di frontend.

**Response 200 (Success)** — array server (sama bentuk `GET /servers`, `lastStatus` & `lastCheckedAt` terbarui).

---

### 4. Detail router — `GET /api/servers/:id`

Butuh JWT (semua role, ter-scope). Password di-strip.

**Response 200 (Success):** objek server (sama bentuk item `GET /servers`).

**Response 404 (Error)**
```json
{ "statusCode": 404, "message": "Router dengan ID cmq... tidak ditemukan", "error": "Not Found" }
```

**Response 403 (Error — bukan router Anda):** `"Anda tidak punya akses ke resource ini"`.

---

### 5. Update router — `PATCH /api/servers/:id`

Butuh JWT (**TEKNISI / SUPER_ADMIN**, ter-scope). Semua field opsional (subset `CreateServerDto`).
`password` diabaikan bila kosong (tidak menimpa), dienkripsi ulang bila diisi.

**Request Payload** (contoh)
```json
{ "name": "CHR-Lab (revisi)", "password": "passbaru" }
```

**Response 200 (Success):** objek server terbaru (password di-strip).
**Response 400 / 403 / 404:** host duplikat / bukan hak akses / tidak ditemukan.

---

### 6. Hapus router — `DELETE /api/servers/:id`

Butuh JWT (**TEKNISI / SUPER_ADMIN**, ter-scope).

**Response 200 (Success):** objek server yang dihapus.
**Response 403 / 404:** bukan hak akses / tidak ditemukan.

---

### 7. Uji koneksi router tersimpan — `POST /api/servers/:id/test-connection`

Butuh JWT (**TEKNISI / SUPER_ADMIN**, ter-scope). Dekripsi password tersimpan, connect ke router,
perbarui `lastStatus` + `lastCheckedAt`. Gagal → catat `ROUTER_CONNECTION_FAILED` di activity log.

**Response 200 (Success)**
```json
{ "serverId": "cmq...", "success": true, "latency": 25, "lastStatus": "ONLINE" }
```

**Response 200 (gagal koneksi)** — tetap 200, `success:false`:
```json
{ "serverId": "cmq...", "success": false, "latency": 0, "error": "Koneksi ke MikroTik gagal: ...", "lastStatus": "OFFLINE" }
```

**Response 404 (Error):** router tidak ditemukan.

---

### 8. Uji koneksi kredensial kustom — `POST /api/servers/test-connection-custom`

Butuh JWT (**TEKNISI / SUPER_ADMIN**). Uji koneksi tanpa menyimpan apa pun — dipakai saat form
tambah router sebelum submit. **Tidak** menyentuh DB.

**Request Payload** (`TestConnectionDto`)
```jsonc
{
  "host": "192.168.56.101",  // wajib
  "port": 8728,              // opsional
  "username": "admin",       // wajib
  "password": "admin",       // wajib (tidak disimpan)
  "useSSL": false            // opsional (default false)
}
```

**Response 200 (reachable)**
```json
{ "success": true, "latency": 25 }
```

**Response 200 (unreachable)** — tetap 200:
```json
{ "success": false, "latency": 0, "error": "Koneksi ke MikroTik gagal: Timed out after 5 seconds" }
```

---

## Hasil Uji Runtime (2026-07-16)

Router uji `CHR-Lab` (dimiliki owner, paket FREE 1 router). Akun: admin (SUPER_ADMIN), owner (OWNER),
teknisi (TEKNISI milik owner).

| Skenario | Verb / Path | Aktor | HTTP | Hasil |
|----------|-------------|-------|:----:|-------|
| Buat router (password di-strip) | `POST /servers` | teknisi | **201** | Router dibuat, `password` tidak ada di response |
| Owner dilarang buat | `POST /servers` | owner | **403** | `"Anda tidak punya hak akses untuk resource ini"` |
| Kuota FREE 1/1 penuh | `POST /servers` | teknisi | **403** | `"Kuota router penuh (1/1). Upgrade paket untuk menambah router."` |
| Daftar router (ter-scope) | `GET /servers` | owner | **200** | Hanya router milik owner |
| Detail router | `GET /servers/:id` | teknisi | **200** | Detail router (password di-strip) |
| Uji koneksi tersimpan | `POST /servers/:id/test-connection` | teknisi | **200** | `{"serverId":"...","success":true,"latency":25,"lastStatus":"ONLINE"}` |
| Refresh status semua | `POST /servers/refresh-status` | teknisi | **200** | Array server (`lastStatus:ONLINE`, `lastCheckedAt` terisi) |
| Uji kredensial kustom (reachable) | `POST /servers/test-connection-custom` | teknisi | **200** | `{"success":true,"latency":25}` |
| Uji kredensial kustom (unreachable) | `POST /servers/test-connection-custom` | teknisi | **200** | `{"success":false,"latency":0,"error":"Koneksi ke MikroTik gagal: Timed out after 5 seconds"}` |
