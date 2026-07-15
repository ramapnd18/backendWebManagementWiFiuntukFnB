# API — Integrasi POS (Voucher On-Demand)

**Modul:** `pos` (`PosController` + `PosService`, `PosKeysController` + `PosKeysService`).
**Status:** ✅ Implementasi selesai (modul `backend/src/modules/pos/`), terdokumentasi live di Swagger
`/api/docs` (tag **POS**, security scheme `pos-api-key`).
**Base URL:** `http://localhost:4000/api`

> Dokumen ini adalah **kontrak endpoint** (as-built) untuk integrator POS. Untuk logika service
> internal, alur idempotensi rinci, dan keputusan desain, lihat [`../spec/SDD.md`](../spec/SDD.md) (bagian POS).
> Panduan uji mandiri (cURL/PowerShell/Postman + skenario 401/201/200/404/400/502) ada di
> [`pos-testing.md`](./pos-testing.md).

---

## 1. Gambaran Alur

```
┌─────────┐   1. GET daftar paket      ┌──────────────┐   2. createHotspotUser   ┌──────────┐
│  Sistem │ ─────────────────────────► │  Sistem Kita │ ───────────────────────► │ MikroTik │
│  POS    │ ◄───────────────────────── │  (NestJS)    │ ◄─────────────────────── │  Router  │
│ (Kasir) │   profil server milik key  │              │   voucher dibuat baru    └──────────┘
│         │   3. POST trigger-voucher  │              │
│         │ ─────────────────────────► │              │
│         │ ◄───────────────────────── │              │
└─────────┘   voucher + QR + tata cara └──────────────┘
```

Prinsip (sesuai arahan mentor):
- Voucher **dibuat baru ke MikroTik saat ada trigger POS** — bukan mengambil stok voucher lama.
- 1 request POS = **1 voucher**. Butuh banyak → POS hit berkali-kali (tiap kali `transactionId` beda).
- Kode voucher **digenerate sistem** (numerik, default 6 digit; env `POS_VOUCHER_CODE_LENGTH`). POS tidak menentukan.
- **Server ditentukan oleh API key** (key dibuat per-outlet, terikat ke satu server). POS tidak perlu mengirim `serverId`.

---

## 2. Autentikasi — API Key (`x-api-key`)

Endpoint POS **tidak** memakai JWT (JWT untuk admin di browser). POS = mesin → pakai **API key** per-outlet.

1. **Admin** membuat API key (per outlet, terikat ke satu server) lewat endpoint admin di bawah.
2. Key mentah (`pos_...`, prefix `pos_` + acak) **ditampilkan SEKALI** saat dibuat. DB hanya menyimpan
   **hash SHA-256** (tak bisa dibalik) + prefix untuk tampilan ter-mask.
3. Tiap request POS menyertakan header `x-api-key: pos_...`.
4. Sistem `sha256(key)` → cari `PosApiKey` yang `isActive`. Tak ketemu / nonaktif → **401**. Sukses → `lastUsedAt` diperbarui.

> SHA-256 tanpa salt aman di sini karena API key ber-entropi tinggi (beda dari password user) dan hash
> deterministik agar bisa di-index untuk lookup cepat.

### Endpoint admin (JWT) untuk kelola key
| Verb | Path | Fungsi |
|------|------|--------|
| POST | `/api/pos-keys` | Buat key baru (`{ label, serverId }`) → **response berisi key mentah, hanya sekali** |
| GET | `/api/pos-keys` | List key (ter-mask) + status + `lastUsedAt` |
| PATCH | `/api/pos-keys/:id` | Aktif/nonaktifkan (`{ isActive: false }`) |
| DELETE | `/api/pos-keys/:id` | Revoke permanen |

---

## 3. Endpoint A — GET Daftar Paket

Kasir butuh daftar paket WiFi (pada server yang terikat ke API key) untuk dipilih.

**Request**
```
GET /api/pos/v1/profiles
Headers:
  x-api-key: pos_a1b2c3...
```

**Response 200** — hanya server milik API key (bentuk `{ servers: [...] }` dipertahankan agar kompatibel):
```jsonc
{
  "servers": [
    {
      "serverId": "cmq1...",
      "serverName": "Outlet A",
      "profiles": [
        { "profileId": "cmp1...", "name": "1 Orang", "rateLimit": "2M/2M", "validity": "1d", "sharedUsers": 1 },
        { "profileId": "cmp2...", "name": "2 Orang", "rateLimit": "4M/4M", "validity": "1d", "sharedUsers": 2 }
      ]
    }
  ]
}
```

Hanya field aman yang dikirim (tanpa host/password mentah).

---

## 4. Endpoint B — POST Trigger Voucher

**Request**
```
POST /api/pos/v1/trigger-voucher
Headers:
  x-api-key: pos_a1b2c3...
  Content-Type: application/json
```
**Body**
```jsonc
{
  "transactionId": "TRX-POS-2026-001",  // WAJIB, unik dari POS → kunci idempotensi
  "profileId": "cmp1...",               // WAJIB — paket yang dipilih kasir
  "serverId": "cmq1...",                // OPSIONAL — server sudah ditentukan API key;
                                        //   bila diisi harus SAMA dgn server milik key, kalau beda → 403
  "outletName": "Outlet A",             // opsional — tampil di struk
  "customerName": "Budi"                // opsional
}
```

**Validasi (`TriggerVoucherDto` + class-validator):**
- `transactionId`: string, wajib, tidak kosong.
- `profileId`: string, wajib, tidak kosong.
- `serverId`: string, **opsional** (bila diisi harus cocok dengan server milik key).
- `outletName`, `customerName`: string, opsional.

**Alur ringkas (`PosService.triggerVoucher`):**
1. `serverId` efektif = server milik API key. Bila body mengirim `serverId` berbeda → **403**.
2. Validasi server ada → **404** bila tidak.
3. Validasi profil ada & milik server tsb → **404** bila tidak.
4. **Idempotensi:** `PosTransaction` dgn `transactionId` sudah SUCCESS → kembalikan voucher sama, **200** (tidak buat baru).
5. Generate username numerik unik (panjang dari `POS_VOUCHER_CODE_LENGTH`, default 6). Password = username.
6. `mikrotikService.createHotspotUser(...)`. Gagal (router offline) → catat `PosTransaction` `FAILED` → **502**
   ("Router tidak dapat dijangkau, coba lagi"). Voucher **tidak** disimpan (POS boleh retry dgn `transactionId` sama).
7. Simpan `Voucher` (status `UNUSED`) + `PosTransaction` (`SUCCESS`) secara atomik.
8. Bangun `loginUrl` + QR base64, catat `ActivityLog` `POS_VOUCHER_GENERATED`.

**Response 201** (atau **200** bila replay idempoten):
```jsonc
{
  "transactionId": "TRX-POS-2026-001",
  "voucher": {
    "username": "738142",
    "password": "738142",
    "profileName": "1 Orang",
    "rateLimit": "2M/2M",
    "validity": "1d",
    "loginUrl": "http://hotspot.outletA.com/login?username=738142&password=738142",
    "qrBase64": "data:image/png;base64,iVBORw0KGgoAAAANS...",
    "instructions": "Sambungkan ke WiFi 'Outlet A' → scan QR atau buka halaman login → masukkan username & password."
  }
}
```

`loginUrl` = `http://{server.dnsName||server.host||'wifi.net'}/login?username=...&password=...`; QR dibuat via `QRCode.toDataURL(loginUrl)`.

---

## 5. Tabel Error / HTTP

| Kondisi | HTTP | Pesan |
|---------|------|-------|
| `x-api-key` kosong/salah/nonaktif | **401** | "API key tidak valid" |
| body `serverId` beda dari server milik key | **403** | "API key ini tidak berhak mengakses server tersebut" |
| server / profil tidak ditemukan | **404** | "Server/Profil ... tidak ditemukan" |
| body tidak valid (DTO) | **400** | pesan validasi (Bahasa Indonesia) |
| router offline saat create voucher | **502** | "Router tidak dapat dijangkau, coba lagi" |
| `transactionId` sudah pernah sukses | **200** | kembalikan voucher yang sama (idempoten) |
| sukses buat voucher | **201** | response voucher |

---

## 6. Skema Database (Prisma) — ringkas

- `PosApiKey` — `keyHash` (unik, sha256), `prefix`, `serverId` (server terikat), `label`, `isActive`, `lastUsedAt`.
- `PosTransaction` — `transactionId` (unik, kunci idempotensi), `serverId`, `profileId`, `voucherId?`,
  `status` (`SUCCESS`/`FAILED`), `errorMessage?`, `outletName?`, `customerName?`.
- Enum `PosTxStatus { SUCCESS, FAILED }`. `LogAction` punya `POS_VOUCHER_GENERATED` & `POS_TRANSACTION_RECEIVED`.

Skema lengkap & migrasi: [`../spec/SDD.md`](../spec/SDD.md) (model data) dan `backend/prisma/schema.prisma`.

---

## 7. Contoh cURL

Buat API key (admin, butuh JWT):
```bash
curl -X POST http://localhost:4000/api/pos-keys \
  -H "Authorization: Bearer <JWT_ADMIN>" -H "Content-Type: application/json" \
  -d '{"label":"Outlet A","serverId":"<id-server>"}'
# → { "id":"...", "key":"pos_a1b2c3...(sekali tampil)" }
```

Ambil daftar paket (POS):
```bash
curl http://localhost:4000/api/pos/v1/profiles -H "x-api-key: pos_a1b2c3..."
```

Trigger voucher (POS):
```bash
curl -X POST http://localhost:4000/api/pos/v1/trigger-voucher \
  -H "x-api-key: pos_a1b2c3..." -H "Content-Type: application/json" \
  -d '{"transactionId":"TRX-001","profileId":"<id>","outletName":"Outlet A"}'
```
