# API — Vouchers (Voucher Hotspot)

**Modul:** `vouchers` (`VouchersController` + `VouchersService` + `VoucherQueueService` BullMQ).
**Status:** ✅ Implementasi selesai & terverifikasi runtime (2026-07-16) — diuji terhadap MikroTik CHR 7.19.3 (`192.168.56.101:8728`).
**Base URL:** `http://localhost:4000/api`

Voucher = kredensial login hotspot (`username`/`password`) yang terdaftar sebagai user di MikroTik.
Bisa dibuat satuan (instant) atau massal (batch, diproses di background via BullMQ), dan dicetak jadi
lembaran **PDF berisi kartu + QR** (endpoint PDF **publik** agar bisa dibuka langsung dari browser/struk).

> Mutasi (single/batch/delete) → **TEKNISI & SUPER_ADMIN**. OWNER **boleh read-only**
> (list, stats, detail — ter-scope). Endpoint **PDF publik** (tanpa JWT).

**Enum `VoucherStatus`:** `UNUSED` · `USED` · `REVOKED` · `EXPIRED`.

---

## Konsep

- **Voucher** milik satu `MikrotikServer` + satu `HotspotProfile`. `username` **unik global**.
- Kode acak menghindari karakter ambigu (`O, I, 1, 0`). Password default = username (mode "voucher code").
- **Scoping** (`serverScopeWhere` / `assertOwnerAccess`): SUPER_ADMIN = semua; OWNER = router miliknya;
  TEKNISI = router milik Owner-nya. Router milik Owner lain → **403**.
- **Batch** tak dibuat sinkron: job masuk antrean BullMQ → response langsung `PENDING` + `batchId`.
- **Hapus massal** hanya untuk voucher `UNUSED`, **partial-safe**: hanya voucher yang benar-benar terhapus
  di router (atau memang sudah tak ada) yang dihapus dari DB; yang gagal tetap tersimpan untuk retry.

---

## Matriks Akses

| Endpoint | SUPER_ADMIN | OWNER | TEKNISI |
|----------|:-:|:-:|:-:|
| `POST /vouchers/single` | ✅ | ❌ 403 | ✅ |
| `POST /vouchers/batch` | ✅ | ❌ 403 | ✅ |
| `POST /vouchers/delete-bulk` | ✅ | ❌ 403 | ✅ |
| `GET /vouchers` | ✅ (semua) | ✅ (miliknya, read-only) | ✅ (milik Owner) |
| `GET /vouchers/stats` | ✅ | ✅ (miliknya, read-only) | ✅ |
| `GET /vouchers/:id` | ✅ | ✅ (miliknya, read-only) | ✅ |
| `GET /vouchers/pdf/single/:id` | publik | publik | publik |
| `GET /vouchers/pdf/batch/:batchId` | publik | publik | publik |
| `GET /vouchers/pdf/filtered` | publik | publik | publik |

> Semua data list/detail/stats otomatis ter-scope: OWNER/TEKNISI hanya melihat voucher pada router milik Owner.

---

## Endpoint

### 1. Buat voucher satuan — `POST /api/vouchers/single`

Role: **TEKNISI / SUPER_ADMIN**. Membuat 1 voucher instant + mendaftarkan user di MikroTik.

**Request Payload** (`GenerateSingleDto`)
```jsonc
{
  "serverId": "cmpnoc2ea0000o0ustysa8zf5", // WAJIB
  "profileId": "cmpnod1ea0000o0ustysa8zf6", // WAJIB
  "outletName": "Kafe Utama Jakarta",       // opsional (tampil di struk)
  "username": "USER12",                     // opsional (4–12 char; kosong → auto 6 digit acak)
  "password": "PASS34"                      // opsional (kosong → disamakan dgn username)
}
```

**Response 201 (Success)** — user dibuat di router, voucher tersimpan `UNUSED`, include `profile`:
```jsonc
{
  "id": "cmv1...",
  "serverId": "cmq1...",
  "profileId": "cmp1...",
  "username": "A7KUEP",
  "password": "A7KUEP",
  "outletName": "Kafe Utama Jakarta",
  "status": "UNUSED",
  "profile": { "id": "cmp1...", "name": "Paket_1_Jam", "rateLimit": "2M/2M", "validity": "1d" },
  "createdAt": "2026-07-16T...",
  "updatedAt": "2026-07-16T..."
}
```

**Response 400 (Error — username sudah dipakai)**
```json
{ "statusCode": 400, "message": "Username \"USER12\" sudah terdaftar", "error": "Bad Request" }
```

**Response 403 (Error — OWNER / router bukan milik Anda)**
```json
{ "statusCode": 403, "message": "Anda tidak punya hak akses untuk resource ini", "error": "Forbidden" }
```

**Response 404 (Error):** router / profil tidak ditemukan.

---

### 2. Buat voucher massal — `POST /api/vouchers/batch`

Role: **TEKNISI / SUPER_ADMIN**. Job dikirim ke **BullMQ** dan diproses di background (tidak menunggu selesai).

**Request Payload** (`GenerateBatchDto`)
```jsonc
{
  "serverId": "cmpnoc2ea0000o0ustysa8zf5", // WAJIB
  "profileId": "cmpnod1ea0000o0ustysa8zf6", // WAJIB
  "count": 50,                              // WAJIB — 1..200 per batch
  "usernamePrefix": "KAFE-",                // opsional
  "charLength": 6,                          // opsional (4..10, default 6)
  "charFormat": "UPPERCASE",                // opsional — UPPERCASE|LOWERCASE|MIXED_CASE|LETTERS_ONLY|NUMBERS_ONLY|ALPHANUMERIC
  "outletName": "Kafe Utama Jakarta"        // opsional
}
```

**Response 201 (Success)** — pekerjaan diterima antrean:
```json
{
  "message": "Pembuatan batch 50 voucher sedang diproses di background",
  "batchId": "BATCH-1752650000000-XYZ",
  "status": "PENDING"
}
```
> Voucher hasil batch diambil kemudian via `GET /vouchers?serverId=...` atau dicetak via `GET /vouchers/pdf/batch/:batchId`.

**Response 404 (Error):** router / profil tidak ditemukan.

---

### 3. Hapus voucher massal — `POST /api/vouchers/delete-bulk`

Role: **TEKNISI / SUPER_ADMIN**. Hanya voucher **UNUSED** yang boleh dihapus. **Partial-safe**.

**Request Payload**
```json
{ "ids": ["cmv1...", "cmv2..."] }
```

**Response 200 (Success)**
```json
{ "success": true, "message": "Berhasil menghapus 2 voucher", "deletedCount": 2, "failedCount": 0, "failedUsernames": [] }
```
**Response 200 (Sebagian gagal — router offline saat hapus di router)**
```json
{ "success": false, "message": "Berhasil menghapus 1 voucher, 1 gagal dihapus di router dan tetap tersimpan. Silakan coba lagi.", "deletedCount": 1, "failedCount": 1, "failedUsernames": ["A7KUEP"] }
```
**Response 200 (ids kosong)**
```json
{ "success": false, "message": "Tidak ada voucher yang dipilih" }
```

**Response 400 (Error — ada voucher non-UNUSED)**
```json
{ "statusCode": 400, "message": "Hanya voucher dengan status UNUSED yang dapat dihapus", "error": "Bad Request" }
```

**Response 404 (Error):** tidak ada voucher yang ditemukan untuk dihapus.

---

### 4. Daftar voucher — `GET /api/vouchers`

Role: **OWNER (read-only) / TEKNISI / SUPER_ADMIN**. Ter-scope + filter + pagination.

**Query (opsional):**
| Param | Tipe | Keterangan |
|-------|------|------------|
| `skip` | number | offset (default 0) |
| `take` | number | limit (default 50) |
| `serverId` | string | filter satu router |
| `profileId` | string | filter satu profil |
| `status` | enum | `UNUSED`/`USED`/`REVOKED`/`EXPIRED` (used/unused) |
| `search` | string | cocokkan `username` atau `outletName` (case-insensitive) |

**Response 200 (Success)** — pola `{ data, meta }`:
```jsonc
{
  "data": [
    {
      "id": "cmv1...",
      "username": "A7KUEP",
      "password": "A7KUEP",
      "status": "UNUSED",
      "outletName": "Kafe Utama Jakarta",
      "profile": { "name": "Paket_1_Jam", "rateLimit": "2M/2M", "validity": "1d" },
      "server": { "name": "CHR-Lab" },
      "createdAt": "2026-07-16T..."
    }
  ],
  "meta": { "total": 59, "skip": 0, "take": 2 }
}
```

---

### 5. Statistik voucher — `GET /api/vouchers/stats`

Role: **OWNER (read-only) / TEKNISI / SUPER_ADMIN**. Satu query `groupBy` status, ter-scope per Owner.

**Query (opsional):** `serverId`, `profileId`.

**Response 200 (Success)** — objek konsisten (0 walau tak ada data):
```json
{ "UNUSED": 59, "USED": 0, "REVOKED": 0, "EXPIRED": 0, "total": 59 }
```

---

### 6. Detail voucher — `GET /api/vouchers/:id`

Role: **OWNER (read-only) / TEKNISI / SUPER_ADMIN**. Include relasi `profile` & `server`.

**Response 200 (Success):** objek voucher.
**Response 404 (Error):** `{ "statusCode": 404, "message": "Voucher dengan ID ... tidak ditemukan", "error": "Not Found" }`

---

### 7. Cetak PDF — `GET /api/vouchers/pdf/*` (PUBLIK)

**Tanpa JWT** (by design, agar bisa dibuka langsung dari browser/struk). Mengembalikan
`Content-Type: application/pdf` (lembaran kartu voucher A4, grid 3×7, tiap kartu berisi QR login).

| Verb | Path | Keterangan |
|------|------|------------|
| GET | `/api/vouchers/pdf/single/:id` | PDF 1 voucher tunggal |
| GET | `/api/vouchers/pdf/batch/:batchId` | PDF semua voucher dalam satu batch |
| GET | `/api/vouchers/pdf/filtered?serverId=&profileId=&status=` | PDF hasil filter (`profileId`/`status` = `ALL` untuk semua) |

- QR di tiap kartu = `http://{server.dnsName||server.host||wifi.net}/login?username=...&password=...`.
- **Response 200:** biner PDF (`application/pdf`).
- **Response 404:** batch/voucher tidak ditemukan, atau tidak ada voucher yang cocok dengan filter.

---

## Hasil Uji Runtime (2026-07-16)

Router uji: **MikroTik CHR 7.19.3** (`192.168.56.101:8728`, RouterOS API binary) — ONLINE.
Akun: `teknisi` (TEKNISI), `owner` (OWNER, paket FREE). Server: `CHR-Lab` (milik owner).

| # | Skenario | Role | Hasil | Catatan |
|---|----------|:-:|:-:|---------|
| 1 | `POST /vouchers/single` | TEKNISI | **201** | voucher `{username,password,status:UNUSED,profile:{...}}` — user dibuat di router |
| 2 | `POST /vouchers/single` (role) | OWNER | **403** | Owner dilarang mutasi |
| 3 | `POST /vouchers/batch` | TEKNISI | **201** | `{"message":"Pembuatan batch 3 voucher sedang diproses di background","batchId":"BATCH-...","status":"PENDING"}` (BullMQ) |
| 4 | `GET /vouchers?take=2` | OWNER | **200** | `{data:[...], meta:{total,skip,take}}` |
| 5 | `GET /vouchers/stats` | OWNER | **200** | `{"UNUSED":59,"USED":0,"REVOKED":0,"EXPIRED":0,"total":59}` |
| 6 | `GET /vouchers/:id` | TEKNISI | **200** | detail + relasi `profile`/`server` |
| 7 | `GET /vouchers/pdf/single/:id` | publik | **200** | `content_type=application/pdf` (2757 bytes) |
| 8 | `GET /vouchers/pdf/filtered?serverId=&profileId=ALL&status=ALL` | publik | **200** | `application/pdf` |
