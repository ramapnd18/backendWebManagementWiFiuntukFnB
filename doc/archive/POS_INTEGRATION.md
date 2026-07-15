# POS_INTEGRATION.md — Spesifikasi & Referensi As-Built Integrasi POS

**Proyek:** Web Management WiFi untuk FnB (P5)
**Status:** ✅ **SUDAH DIIMPLEMENTASIKAN & dimigrasikan** ke backend utama. Modul ada di
`backend/src/modules/pos/` (10 file). Migrasi DB `add_pos_integration` diterapkan. Build `nest build` 0 error.
Endpoint juga terdokumentasi live di Swagger `/api/docs` (tag **POS**, security scheme `pos-api-key`).

Dokumen ini = spesifikasi + referensi as-built. Diverifikasi konsisten dengan kode nyata.

> **Catatan port:** backend utama berjalan di **`:4100`** (`http://localhost:4100/api`). Contoh cURL di bawah memakai port itu.

---

## 1. Gambaran Alur

```
┌─────────┐   1. GET daftar paket      ┌──────────────┐   2. createHotspotUser   ┌──────────┐
│  Sistem │ ─────────────────────────► │  Sistem Kita │ ───────────────────────► │ MikroTik │
│  POS    │ ◄───────────────────────── │  (NestJS)    │ ◄─────────────────────── │  Router  │
│ (Kasir) │   list server + profil     │              │   voucher dibuat baru    └──────────┘
│         │                            │              │
│         │   3. POST trigger-voucher  │              │
│         │ ─────────────────────────► │              │
│         │ ◄───────────────────────── │              │
└─────────┘   voucher + QR + tata cara └──────────────┘
```

Prinsip penting (sesuai arahan mentor):
- Voucher **dibuat baru ke MikroTik saat ada trigger POS** — BUKAN mengambil stok voucher lama.
- 1 request POS = **1 voucher**. Mau banyak → POS hit berkali-kali (tiap kali `transactionId` beda).
- Kode voucher **digenerate sistem kita** (default 6 digit angka). POS tidak menentukan.

---

## 2. Autentikasi — API Key (`x-api-key`)

Endpoint POS **tidak** memakai JWT (JWT untuk admin di browser). POS = mesin → pakai **API key**.

### Cara kerja
1. **Admin** membuat API key dari panel (per outlet/POS). Sistem generate key acak kuat, mis:
   `pos_a1b2c3d4e5f6...` (prefix `pos_` + 32+ char acak).
2. Key **mentah ditampilkan SEKALI** saat dibuat (admin salin ke konfigurasi POS). DB hanya menyimpan
   **hash SHA-256** dari key (tidak bisa dibalik).
3. Setiap request POS menyertakan header: `x-api-key: pos_a1b2c3...`.
4. Sistem: `sha256(key)` → cari `PosApiKey` yang `isActive` by `keyHash`. Tak ketemu / nonaktif → **401**.
5. Update `lastUsedAt` (untuk audit).

> SHA-256 tanpa salt boleh di sini karena API key ber-entropi tinggi (beda dengan password user),
> dan hash deterministik supaya bisa di-index untuk lookup cepat.

### Endpoint admin (JWT) untuk kelola key
| Verb | Path | Fungsi |
|------|------|--------|
| POST | `/api/pos-keys` | Buat key baru (`{ label: "Outlet A" }`) → **response berisi key mentah, hanya sekali** |
| GET | `/api/pos-keys` | List key (ter-mask, mis. `pos_a1b2••••••`) + status + lastUsedAt |
| PATCH | `/api/pos-keys/:id` | Nonaktifkan/aktifkan (`{ isActive: false }`) |
| DELETE | `/api/pos-keys/:id` | Hapus (revoke permanen) |

---

## 3. Endpoint A — GET Daftar Paket

Kasir butuh daftar paket WiFi (per router) untuk dipilih.

**Request**
```
GET /api/pos/v1/profiles
Headers:
  x-api-key: pos_a1b2c3...
```

**Response 200** — dikelompokkan per server (1 akun bisa banyak router):
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

**Sumber data:** `prisma.mikrotikServer.findMany({ include: { profiles: true } })` →
map hanya field aman (jangan kirim password/host mentah bila tak perlu).

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
  "transactionId": "TRX-POS-2026-001",  // WAJIB, unik dari POS → idempoten
  "serverId": "cmq1...",                // WAJIB — router target (multi-router)
  "profileId": "cmp1...",               // paket yang dipilih kasir
  "outletName": "Outlet A",             // opsional — tampil di struk
  "customerName": "Budi"                // opsional
}
```

**Validasi body (DTO + class-validator):**
- `transactionId`: string, wajib, tidak kosong.
- `serverId`, `profileId`: string, wajib.
- `outletName`, `customerName`: string, opsional.

**Alur service (`PosService.triggerVoucher`):**
1. Validasi server ada (`findUnique`) → 404 bila tidak.
2. Validasi profil ada & milik server tsb → 404 bila tidak.
3. **Idempotensi:** cek `PosTransaction` by `transactionId`.
   - Sudah ada → ambil voucher lamanya, **kembalikan response yang sama (200)**, JANGAN buat baru.
4. Generate username 6 digit **angka** unik (`generateNumericCode` di `pos.util.ts` — numerik murni
   sesuai prinsip §1; bukan `generateRandomCode` voucher yang alfanumerik). Panjang dari env
   `POS_VOUCHER_CODE_LENGTH` default `6`. Password = username.
5. **`mikrotikService.createHotspotUser(serverId, username, password, profile.name)`**.
   - Gagal (router offline/timeout) → catat `PosTransaction` status `FAILED` → balas **502** dengan
     pesan jelas. **Jangan** simpan voucher sukses (POS bisa retry dgn transactionId sama).
6. Simpan `Voucher` (status `UNUSED`, outletName) + `PosTransaction` (SUCCESS, voucherId).
7. Bangun `loginUrl` + QR base64.
8. Catat `ActivityLog` action `POS_VOUCHER_GENERATED`.

**Response 201**
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

**Login URL + QR** (pola dari `vouchers.service.ts:320-322`):
```ts
const host = server.dnsName || server.host || 'wifi.net';
const loginUrl = `http://${host}/login?username=${username}&password=${password}`;
const qrBase64 = await QRCode.toDataURL(loginUrl); // data:image/png;base64,...
```

---

## 5. Skema Database (Prisma)

Tambahkan ke `schema.prisma`:

```prisma
model PosApiKey {
  id         String   @id @default(cuid())
  label      String              // nama outlet / identitas POS
  keyHash    String   @unique    // sha256(key mentah)
  prefix     String              // 8-12 char awal utk tampilan ter-mask
  isActive   Boolean  @default(true)
  lastUsedAt DateTime?
  createdAt  DateTime @default(now())

  transactions PosTransaction[]

  @@map("pos_api_keys")
}

model PosTransaction {
  id            String      @id @default(cuid())
  transactionId String      @unique   // dari POS — kunci idempotensi
  posApiKeyId   String?
  serverId      String
  profileId     String
  voucherId     String?
  status        PosTxStatus @default(SUCCESS)
  errorMessage  String?
  outletName    String?
  customerName  String?
  createdAt     DateTime    @default(now())

  posApiKey PosApiKey? @relation(fields: [posApiKeyId], references: [id])

  @@index([serverId])
  @@map("pos_transactions")
}

enum PosTxStatus {
  SUCCESS
  FAILED
}
```

- Enum `LogAction` **sudah** punya `POS_VOUCHER_GENERATED` & `POS_TRANSACTION_RECEIVED` (siap dipakai).
- Buat migrasi: `npx prisma migrate dev --name add_pos`.
- Env baru: `POS_VOUCHER_CODE_LENGTH=6` (+ tak perlu `POS_API_KEY` global lagi — key di DB).

---

## 6. Tabel Error / HTTP

| Kondisi | HTTP | Pesan |
|---------|------|-------|
| `x-api-key` kosong/salah/nonaktif | **401** | "API key tidak valid" |
| server / profil tidak ditemukan | **404** | "Server/Profil tidak ditemukan" |
| body tidak valid (DTO) | **400** | pesan validasi |
| router offline saat create voucher | **502** | "Router tidak dapat dijangkau, coba lagi" |
| `transactionId` sudah pernah | **200** | kembalikan voucher yang sama (idempoten) |
| sukses buat voucher | **201** | response voucher |

---

## 7. Struktur Modul yang Disarankan

```
backend/src/modules/pos/                  # ← AS-BUILT (10 file)
├── pos.module.ts
├── pos.controller.ts          # GET /pos/v1/profiles, POST /pos/v1/trigger-voucher (x-api-key)
├── pos.service.ts             # logika trigger + idempotensi + listProfiles
├── pos-keys.controller.ts     # admin (JWT): CRUD api key
├── pos-keys.service.ts        # generate/hash/revoke key
├── pos.util.ts                # hashApiKey / generatePosApiKey / maskApiKey / generateNumericCode
├── guards/
│   └── pos-api-key.guard.ts   # validasi x-api-key
└── dto/
    ├── trigger-voucher.dto.ts
    ├── create-pos-key.dto.ts
    └── update-pos-key.dto.ts  # { isActive } untuk PATCH
```
`PosModule` sudah terdaftar di `app.module.ts`. Swagger `pos-api-key` (`x-api-key` header) didaftarkan di `main.ts`.

---

## 8. Contoh cURL (untuk uji setelah implementasi)

Buat API key (admin, butuh JWT):
```bash
curl -X POST http://localhost:4100/api/pos-keys \
  -H "Authorization: Bearer <JWT_ADMIN>" -H "Content-Type: application/json" \
  -d '{"label":"Outlet A"}'
# → { "id":"...", "key":"pos_a1b2c3...(sekali tampil)" }
```

Ambil daftar paket (POS):
```bash
curl http://localhost:4100/api/pos/v1/profiles -H "x-api-key: pos_a1b2c3..."
```

Trigger voucher (POS):
```bash
curl -X POST http://localhost:4100/api/pos/v1/trigger-voucher \
  -H "x-api-key: pos_a1b2c3..." -H "Content-Type: application/json" \
  -d '{"transactionId":"TRX-001","serverId":"<id>","profileId":"<id>","outletName":"Outlet A"}'
```

---

## 9. Checklist Implementasi — ✅ SELESAI

- [x] Tambah model `PosApiKey`, `PosTransaction`, enum `PosTxStatus` ke `schema.prisma`
- [x] `npx prisma migrate dev` → migrasi `20260612230120_add_pos_integration` (CREATE 2 tabel, no drop)
- [x] `pos-keys` service+controller (admin JWT): generate key (random + sha256), list (mask), aktif/nonaktif, revoke
- [x] `PosApiKeyGuard`: validasi `x-api-key` → hash → lookup aktif → update `lastUsedAt`
- [x] `GET /pos/v1/profiles`: list server + profil (map field aman)
- [x] `POST /pos/v1/trigger-voucher`: validasi → idempotensi → generate kode → `createHotspotUser` →
      simpan voucher+transaksi → loginUrl+QR → activity log
- [x] DTO + class-validator (pesan Bahasa Indonesia)
- [x] Daftarkan `PosModule` di `app.module.ts` + swagger `pos-api-key` di `main.ts`
- [x] Env `POS_VOUCHER_CODE_LENGTH=6` (+ `.env.example`)
- [x] Build `nest build` 0 error, `prisma generate` OK
- [ ] **Uji runtime cURL** (401/201/200/502) — perlu backend di-restart dgn build baru (lihat catatan bawah)
- [ ] (Frontend POS) — di luar scope iterasi ini (kelola key via Swagger/cURL)

> **Catatan verifikasi:** kode telah diverifikasi statik konsisten dengan spec ini (auth/idempotensi/error/QR).
> Uji runtime menunggu **restart backend** (proses lama belum memuat modul POS). Setelah `npm run start:dev`,
> tag **POS** muncul di Swagger `/api/docs` dan endpoint `/api/pos-keys` + `/api/pos/v1/*` aktif.

---

## 10. Reuse dari Kode yang Sudah Ada
| Butuh | Pakai |
|-------|-------|
| Generate kode unik | `generateRandomCode(length)` — `vouchers.service.ts:21` |
| Buat user di router | `MikrotikService.createHotspotUser()` |
| Pola cek server/profil → create | `VouchersService.generateSingle()` — `vouchers.service.ts:39` |
| Login URL + QR | pola `vouchers.service.ts:320-322` (pakai `QRCode.toDataURL`) |
| Activity log | `ActivityLogService.logAction()` |
